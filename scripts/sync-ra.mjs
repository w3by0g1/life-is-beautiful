#!/usr/bin/env node
// Copies life is beautiful's events from Resident Advisor into Sanity, where
// the happenings calendar reads them (see src/sanity.js).
//
// RA has no public API for this, so it reads the GraphQL endpoint ra.co's own
// pages use, for both of the collective's promoter pages. The browser can't
// do that itself (RA doesn't allow other sites to call it), so this runs on a
// schedule instead (.github/workflows/sync-ra.yml) and writes into Sanity.
//
// Each RA event becomes an event document with the id "ra-event-<RA id>"; its
// flyer is uploaded as the poster, its lineup is linked to the roster where a
// name matches, and "get tickets" goes to its RA page. A run only writes the
// events that are new or have changed on RA since the last one. An upcoming
// event that disappears from RA (cancelled) is removed; past ones are kept.
// Events made by hand in the studio are left alone, and an RA event with the
// same date and title as one of them is skipped rather than shown twice.
//
// Usage: SANITY_WRITE_TOKEN=… node scripts/sync-ra.mjs [--dry-run]

import { createHash } from "node:crypto";

const PROMOTERS = ["121954", "121688"]; // life is beautiful records, life is beautiful
const PROJECT_ID = "3x555lnx";
const DATASET = "production";
const API = `https://${PROJECT_ID}.api.sanity.io/v2025-02-19`;
const TOKEN = process.env.SANITY_WRITE_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

const RA_HEADERS = {
  "Content-Type": "application/json",
  Referer: "https://ra.co/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
};

const EVENT_FIELDS = `id title date startTime contentUrl content
  venue { name }
  images { filename type }
  flyerFront
  artists { name contentUrl }`;

async function ra(query) {
  const res = await fetch("https://ra.co/graphql", { method: "POST", headers: RA_HEADERS, body: JSON.stringify({ query }) });
  if (!res.ok) throw new Error(`RA answered ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`RA: ${json.errors.map((e) => e.message).join("; ")}`);
  return json.data;
}

// Every event on both promoter pages, upcoming and past, once each.
async function raEvents() {
  const byId = new Map();
  for (const id of PROMOTERS)
    for (const type of ["LATEST", "PREVIOUS"]) {
      const data = await ra(`{ promoter(id: "${id}") { events(limit: 500, type: ${type}) { ${EVENT_FIELDS} } } }`);
      for (const e of data.promoter?.events ?? []) byId.set(e.id, e);
    }
  return [...byId.values()];
}

async function sanity(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...init.headers } });
  if (!res.ok) throw new Error(`Sanity answered ${res.status}: ${await res.text()}`);
  return res.json();
}

const query = async (groq) => (await sanity(`/data/query/${DATASET}?${new URLSearchParams({ query: groq })}`)).result;

const mutate = (mutations) =>
  sanity(`/data/mutate/${DATASET}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mutations }),
  });

async function uploadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download the flyer ${url} (${res.status})`);
  const filename = url.split("/").pop();
  const { document } = await sanity(`/assets/images/${DATASET}?${new URLSearchParams({ filename })}`, {
    method: "POST",
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg" },
    body: Buffer.from(await res.arrayBuffer()),
  });
  return document._id;
}

// "life is beautiful #clubnight" and "Life Is Beautiful – #Clubnight" match.
const sameTitle = (a) => (a ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// "2026-09-20T19:30:00.000" → "7:30pm".
function time(start) {
  const m = start?.match(/T(\d\d):(\d\d)/);
  if (!m) return undefined;
  const h = Number(m[1]);
  return `${h % 12 || 12}${m[2] === "00" ? "" : `:${m[2]}`}${h < 12 ? "am" : "pm"}`;
}

// RA's plain-text description → the studio's rich text: a paragraph per
// blank-line-separated stretch (single line breaks are kept inside it).
const richText = (text) =>
  (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => ({
      _type: "block",
      _key: `p${i}`,
      style: "normal",
      markDefs: [],
      children: [{ _type: "span", _key: `p${i}s`, text: p, marks: [] }],
    }));

const flyerOf = (e) => e.images?.find((i) => i.type === "FLYERFRONT")?.filename ?? e.images?.[0]?.filename ?? e.flyerFront ?? null;

async function main() {
  if (!TOKEN && !DRY_RUN) throw new Error("Set SANITY_WRITE_TOKEN (a Sanity API token with Editor rights).");

  const events = await raEvents();
  if (!events.length) throw new Error("RA returned no events; leaving Sanity as it is.");

  const [existing, roster] = TOKEN
    ? await Promise.all([
        query(`*[_type == "event"]{ _id, title, date, raId, raHash, raFlyer, "posterRef": poster.asset._ref }`),
        query(`*[_type == "artist" && defined(name)]{ _id, name }`),
      ])
    : [[], []];
  const fromRa = new Map(existing.filter((d) => d.raId).map((d) => [d.raId, d]));
  const byHand = existing.filter((d) => !d.raId);
  const rosterByName = new Map(roster.map((a) => [a.name.toLowerCase(), a._id]));

  const mutations = [];
  let skipped = 0;
  for (const e of events) {
    const date = e.date.slice(0, 10);
    const dupe = byHand.find((d) => d.date === date && sameTitle(d.title) === sameTitle(e.title));
    if (dupe) {
      console.log(`skip  ${date} ${e.title} (already in the studio by hand)`);
      continue;
    }

    const flyer = flyerOf(e);
    const doc = {
      _id: `ra-event-${e.id}`,
      _type: "event",
      raId: e.id,
      title: e.title,
      date,
      time: time(e.startTime),
      venue: e.venue?.name,
      description: richText(e.content),
      ticketUrl: `https://ra.co${e.contentUrl ?? `/events/${e.id}`}`,
      lineup: (e.artists ?? []).map((a, i) => {
        const ref = rosterByName.get(a.name.toLowerCase());
        return ref
          ? { _type: "lineupEntry", _key: `a${i}`, artist: { _type: "reference", _ref: ref } }
          : { _type: "lineupEntry", _key: `a${i}`, name: a.name, ...(a.contentUrl && { url: `https://ra.co${a.contentUrl}` }) };
      }),
    };
    const raHash = createHash("sha1").update(JSON.stringify([doc, flyer])).digest("hex");
    const prev = fromRa.get(e.id);
    if (prev?.raHash === raHash) {
      skipped++;
      continue;
    }

    // The flyer is only uploaded again if RA's has changed.
    let posterRef = prev?.raFlyer === flyer ? prev.posterRef : null;
    if (flyer && !posterRef && !DRY_RUN) posterRef = await uploadImage(flyer);
    mutations.push({
      createOrReplace: {
        ...doc,
        raHash,
        raFlyer: flyer,
        ...(posterRef && { poster: { _type: "image", alt: e.title, asset: { _type: "reference", _ref: posterRef } } }),
      },
    });
    console.log(`${prev ? "update" : "add  "} ${date} ${e.title}`);
  }

  // Upcoming events that have gone from RA were called off.
  const today = new Date().toISOString().slice(0, 10);
  const live = new Set(events.map((e) => e.id));
  for (const d of fromRa.values())
    if (!live.has(d.raId) && d.date >= today) {
      mutations.push({ delete: { id: d._id } });
      console.log(`remove ${d.date} ${d.title} (no longer on RA)`);
    }

  console.log(`${events.length} events on RA: ${mutations.length} to write, ${skipped} unchanged.`);
  if (DRY_RUN || !mutations.length) return;
  for (let i = 0; i < mutations.length; i += 20) await mutate(mutations.slice(i, i + 20));
  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
