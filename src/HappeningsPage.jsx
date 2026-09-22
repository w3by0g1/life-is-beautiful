import { useEffect, useMemo, useState } from "react";
import { fetchEvents, imageUrl } from "./sanity.js";
import { RichText } from "./ArtistPage.jsx";

// The happenings calendar, over the blurred sheet: a month of days (Monday
// first), each day with an event showing its poster, and the chosen event's
// details beside it. Events come from Sanity.

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// Dates as "YYYY-MM-DD" (as Sanity stores them), in local time.
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const todayIso = () => {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
};
// "2026-08-10" → "MON, 10 AUG 2026".
const formatDate = (date) =>
  new Date(`${date}T00:00:00Z`)
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .replace(/,/g, "")
    .replace(/^(\w+) /, "$1, ")
    .toUpperCase();

function Lineup({ lineup, onArtist }) {
  const people = (lineup ?? []).filter((p) => p.artist?.name || p.name);
  if (!people.length) return null;
  return (
    <p className="hp-lineup">
      alongside{" "}
      {people.map((p, i) => {
        const name = p.artist?.name ?? p.name;
        const sep = i < people.length - 1 ? ", " : "";
        if (p.artist?.slug)
          return (
            <span key={p._key}>
              <a
                href={`#artists/${encodeURIComponent(p.artist.slug)}`}
                onClick={(e) => {
                  e.preventDefault();
                  onArtist(p.artist.slug);
                }}
              >
                {name}
              </a>
              {sep}
            </span>
          );
        if (p.url)
          return (
            <span key={p._key}>
              <a href={p.url} target="_blank" rel="noreferrer">
                {name}
              </a>
              {sep}
            </span>
          );
        return (
          <span key={p._key}>
            {name}
            {sep}
          </span>
        );
      })}
    </p>
  );
}

function EventDetails({ event, onArtist }) {
  return (
    <div className="hp-details" key={event._id}>
      {event.poster?.url && <img className="hp-poster" src={imageUrl(event.poster.url, 400)} alt={event.poster.alt ?? event.title} />}
      <h2>{event.title}</h2>
      <p className="ap-meta">{[formatDate(event.date), event.time, event.venue].filter(Boolean).join(" • ")}</p>
      <Lineup lineup={event.lineup} onArtist={onArtist} />
      <div className="ap-rich hp-description">
        <RichText value={event.description} />
      </div>
      {event.ticketUrl && (
        <a className="ap-listen hp-tickets" href={event.ticketUrl} target="_blank" rel="noreferrer">
          get tickets
        </a>
      )}
    </div>
  );
}

// open: whether the calendar is showing; onClose: back to the sheet;
// onArtist(slug): opens an artist's page (from the lineup).
export default function HappeningsPage({ open, onClose, onArtist }) {
  const [events, setEvents] = useState(null);
  const [month, setMonth] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [chosenId, setChosenId] = useState(null);

  useEffect(() => {
    if (!open || events) return;
    let cancelled = false;
    fetchEvents()
      .then((list) => !cancelled && setEvents(list ?? []))
      .catch(() => !cancelled && setEvents([]));
    return () => {
      cancelled = true;
    };
  }, [open, events]);

  const today = todayIso();
  const byDate = useMemo(() => {
    const map = new Map();
    for (const e of events ?? []) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);
  // The chosen event, or else the next one coming up (or the latest past one).
  const chosen =
    (events ?? []).find((e) => e._id === chosenId) ??
    (events ?? []).find((e) => e.date >= today) ??
    (events ?? []).at(-1) ??
    null;

  // The month's grid: blank cells before the 1st (so weeks start on Monday),
  // then each day.
  const { y, m } = month;
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const step = (d) => setMonth(({ y, m }) => ({ y: y + Math.floor((m + d) / 12), m: (m + d + 12) % 12 }));

  return (
    <div
      className={`artist-page happenings-page${open ? " open" : ""}${events ? " loaded" : ""}`}
      aria-hidden={!open}
      onClick={(e) => {
        const c = e.target.classList;
        if (e.target === e.currentTarget || c.contains("ap-scroll") || c.contains("hp-inner")) onClose();
      }}
    >
      <div className="ap-scroll">
        <div className="ap-inner hp-inner">
          <section className="hp-calendar">
            <div className="hp-month">
              <button type="button" onClick={() => step(-1)} aria-label="Previous month">
                ←
              </button>
              <h2>
                {MONTHS[m]} {y}
              </h2>
              <button type="button" onClick={() => step(1)} aria-label="Next month">
                →
              </button>
            </div>
            <div className="hp-grid">
              {DAYS.map((d) => (
                <div key={d} className="hp-dayname">
                  <span className="hp-long">{d}</span>
                  <span className="hp-short">{d.slice(0, 3)}</span>
                </div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`blank${i}`} />;
                const date = iso(y, m, d);
                const dayEvents = byDate.get(date) ?? [];
                const ev = dayEvents[0];
                const past = date < today;
                const isChosen = ev && chosen && dayEvents.some((e) => e._id === chosen._id);
                return (
                  <button
                    type="button"
                    key={date}
                    className={`hp-day${past ? " past" : ""}${ev ? " has-event" : ""}${isChosen ? " chosen" : ""}`}
                    disabled={!ev}
                    onClick={() => {
                      if (!ev) return;
                      // Clicking a day with several events steps through them.
                      const at = dayEvents.findIndex((e) => e._id === chosen?._id);
                      setChosenId(dayEvents[(at + 1) % dayEvents.length]._id);
                    }}
                    aria-label={ev ? `${ev.title}, ${formatDate(date)}` : undefined}
                  >
                    {ev?.poster?.url ? (
                      <img src={imageUrl(ev.poster.url, 120)} alt="" loading="lazy" />
                    ) : (
                      <span className="hp-daynum">{d}</span>
                    )}
                    {dayEvents.length > 1 && <span className="hp-more">+{dayEvents.length - 1}</span>}
                  </button>
                );
              })}
            </div>
          </section>
          <aside className="hp-side">
            {chosen ? (
              <EventDetails event={chosen} onArtist={onArtist} />
            ) : (
              events && <p className="hp-empty">No happenings yet.</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
