// Fills an artist's discography in Sanity from their Bandcamp page.
//
// Bandcamp's developer API is for sellers only, but the one their phone app
// uses answers to anyone: band_details lists a band's whole discography, and
// tralbum_details gives a release's date, about text, tracklist and artwork.
// (The artist's /music page is no good on its own — it only carries the first
// screenful of the grid.) This maps those onto the artist's `content`, as
// albums and singles (see studio/schemaTypes/release.ts).
//
//   node scripts/import-bandcamp.mjs aloisius            # dry run: prints only
//   node scripts/import-bandcamp.mjs aloisius --apply    # writes to Sanity
//
// Writing uses the Sanity CLI's own login (~/.config/sanity/config.json), or
// SANITY_WRITE_TOKEN if that's set. Nothing is deleted or overwritten: a
// release the artist already has is left alone, and one whose title is nearly
// the same as an existing entry is skipped and listed, in case it's the same
// release under a slightly different name (--force takes those too).
// --skip "a title, another" leaves those out: releases taken off the artist on
// purpose would otherwise come back on the next run.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const PROJECT = '3x555lnx'
const DATASET = 'production'
const API = '2025-02-19'
const BC = 'https://bandcamp.com/api/mobile/24'
// Bandcamp is asked for one release at a time, with a pause between.
const PAUSE = 300
// A tracklist longer than this is left off: a compilation of hundreds of takes
// would bury the page, and it can be added by hand if it's wanted.
const MAX_TRACKS = 50

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const force = args.includes('--force')
const skip = (args[args.indexOf('--skip') + 1] ?? '')
  .split(',')
  .map((t) => t.trim().toLowerCase())
  .filter(Boolean)
const slug = args.find((a) => !a.startsWith('-'))
if (!slug) {
  console.error('Which artist? e.g. node scripts/import-bandcamp.mjs aloisius [--apply] [--force]')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const key = () => Math.random().toString(36).slice(2, 14)

const token = () => {
  if (process.env.SANITY_WRITE_TOKEN) return process.env.SANITY_WRITE_TOKEN
  try {
    return JSON.parse(readFileSync(path.join(homedir(), '.config/sanity/config.json'), 'utf8')).authToken
  } catch {
    return null
  }
}

const query = async (groq, params = {}) => {
  const url = new URL(`https://${PROJECT}.api.sanity.io/v${API}/data/query/${DATASET}`)
  url.searchParams.set('query', groq)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(`$${k}`, JSON.stringify(v))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status}`)
  return (await res.json()).result
}

const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (life is beautiful import)' } })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res
}

// The band's id, which the API works in. Bandcamp leaves it on their pages in
// a few different shapes, depending on the page's layout.
const bandId = async (bandcampUrl) => {
  const html = await (await get(bandcampUrl.replace(/\/$/, '') + '/music')).text()
  for (const pattern of [/&quot;band_id&quot;:(\d+)/, /"band_id":(\d+)/, /band_id=(\d+)/, /data-band="\{&quot;id&quot;:(\d+)/]) {
    const m = html.match(pattern)
    if (m) return m[1]
  }
  throw new Error(`couldn't find the band id at ${bandcampUrl}`)
}

// Titles that are the same but for punctuation and case, or nearly so: the
// same words in the same order, give or take a repeat.
const words = (title) =>
  (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
const alike = (a, b) => {
  const [x, y] = [new Set(words(a)), new Set(words(b))]
  if (!x.size || !y.size) return false
  const shared = [...x].filter((w) => y.has(w)).length
  return shared / Math.max(x.size, y.size) >= 0.8
}

// Bandcamp's plain text → the paragraphs of a richText field. Every line break
// starts a new paragraph: a block holding newlines would look right in the
// studio but run together on the site, where HTML swallows them.
const RULE = /^[-_—–=·.\s]{3,}$/
const richText = (text) =>
  (text ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    // A line of dashes standing in for a rule: the page draws its own between
    // the notes and the tracklist.
    .filter((p) => p && !RULE.test(p))
    .map((p) => ({
      _type: 'block',
      _key: key(),
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: key(), text: p, marks: [] }],
    }))

const isoDate = (value) => {
  const t = typeof value === 'number' ? value * 1000 : Date.parse(value ?? '')
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10)
}

// A release with no streamable tracks often lists them in its notes instead,
// after a "tracklist:" line; those become the tracklist rather than a long tail
// of paragraphs on the page.
const splitListedTracks = (about, tracks) => {
  if (tracks.length) return { about, tracks }
  const lines = about.split(/\n+/).map((l) => l.trim())
  const at = lines.findIndex((l) => /^track\s?list:?$/i.test(l))
  if (at < 0 || at === lines.length - 1) return { about, tracks }
  return {
    about: lines.slice(0, at).join('\n'),
    tracks: lines.slice(at + 1).filter(Boolean).map((title) => ({ title })),
  }
}

const release = async (band, item) => {
  const res = await get(`${BC}/tralbum_details?band_id=${band}&tralbum_id=${item.item_id}&tralbum_type=${item.item_type === 'album' ? 'a' : 't'}`)
  const d = await res.json()
  const isAlbum = item.item_type === 'album'
  const art = d.art_id ?? item.art_id
  const listed = splitListedTracks(d.about ?? '', isAlbum ? (d.tracks ?? []) : [])
  return {
    type: isAlbum ? 'album' : 'single',
    title: d.title ?? item.title,
    date: isoDate(d.release_date ?? item.release_date),
    about: listed.about,
    link: d.bandcamp_url,
    art: art ? `https://f4.bcbits.com/img/a${String(art).padStart(10, '0')}_10.jpg` : null,
    artist: d.tralbum_artist ?? item.artist_name ?? null,
    tracks: isAlbum ? listed.tracks.map((t) => ({ title: t.title })) : [],
    // (Kept for the note printed below.)
    allTracks: isAlbum ? listed.tracks.length : 0,
  }
}

// Uploads an image to Sanity and returns its asset id.
const upload = async (url, auth) => {
  const body = Buffer.from(await (await get(url)).arrayBuffer())
  const res = await fetch(`https://${PROJECT}.api.sanity.io/v${API}/assets/images/${DATASET}?filename=${encodeURIComponent(path.basename(url))}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'image/jpeg' },
    body,
  })
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`)
  return (await res.json()).document._id
}

const main = async () => {
  const artist = await query(
    `*[_type == "artist" && slug.current == $slug][0] { _id, name, bandcamp, "have": content[].title }`,
    { slug },
  )
  if (!artist) throw new Error(`No artist "${slug}" in Sanity.`)
  if (!artist.bandcamp) throw new Error(`${artist.name} has no Bandcamp link in Sanity.`)
  console.log(`${artist.name} — ${artist.bandcamp}`)

  const band = await bandId(artist.bandcamp)
  const items = (await (await get(`${BC}/band_details?band_id=${band}`)).json()).discography ?? []
  const have = (artist.have ?? []).filter(Boolean)
  console.log(`  ${items.length} releases on Bandcamp, ${have.length} already on the artist\n`)

  const wanted = []
  for (const item of items) {
    const same = have.find((t) => t.toLowerCase() === (item.title ?? '').toLowerCase())
    if (same) continue
    if (skip.includes((item.title ?? '').toLowerCase())) {
      console.log(`  - ${item.title} (skipped)`)
      continue
    }
    const near = have.find((t) => alike(t, item.title))
    if (near && !force) {
      console.log(`  ~ ${item.title}\n      looks like "${near}", which is already there — skipped (--force to add it)`)
      continue
    }
    wanted.push(item)
  }

  const releases = []
  for (const item of wanted) {
    await sleep(PAUSE)
    try {
      const r = await release(band, item)
      if (r.tracks.length > MAX_TRACKS) r.tracks = []
      releases.push(r)
      const note = r.allTracks > MAX_TRACKS ? `  (${r.allTracks} tracks — too many to list, left off)` : r.tracks.length ? `  (${r.tracks.length} tracks)` : ''
      console.log(`  ${r.type.padEnd(6)} ${(r.date ?? '').padEnd(10)} ${r.title}${note}`)
    } catch (err) {
      console.log(`  ! ${item.title}: ${err.message}`)
    }
  }

  if (!apply) {
    console.log(`\n${releases.length} would be added. Run again with --apply to write them.`)
    return
  }

  const auth = token()
  if (!auth) throw new Error('No Sanity token: log in with `npx sanity login` in studio/, or set SANITY_WRITE_TOKEN.')

  const content = []
  for (const r of releases) {
    const asset = r.art ? await upload(r.art, auth) : null
    content.push({
      _type: r.type,
      _key: key(),
      title: r.title,
      ...(r.date ? { date: r.date } : {}),
      ...(r.about ? { description: richText(r.about) } : {}),
      ...(r.link ? { link: r.link } : {}),
      ...(asset ? { artwork: { _type: 'image', asset: { _type: 'reference', _ref: asset }, alt: r.title } } : {}),
      ...(r.tracks.length ? { tracklist: r.tracks.map((t) => ({ _type: 'track', _key: key(), title: t.title })) } : {}),
    })
    console.log(`  uploaded artwork for ${r.title}`)
  }

  const res = await fetch(`https://${PROJECT}.api.sanity.io/v${API}/data/mutate/${DATASET}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      mutations: [{ patch: { id: artist._id, setIfMissing: { content: [] }, insert: { after: 'content[-1]', items: content } } }],
    }),
  })
  if (!res.ok) throw new Error(`write failed: ${res.status} ${await res.text()}`)
  console.log(`\nAdded ${content.length} releases to ${artist.name}.`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
