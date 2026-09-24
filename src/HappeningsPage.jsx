import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchEvents, imageUrl } from "./sanity.js";
import { RichText } from "./ArtistPage.jsx";

// The happenings calendar, over the blurred sheet: a month of days (Monday
// first), each day with an event showing its poster, and the chosen event's
// details beside it. Events come from Sanity.

// The calendar is a strip of months you scroll through: this many either
// side of this one.
const MONTHS_EITHER_SIDE = 12;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// A month, d months along: [year, month].
const shift = (y, m, d) => [y + Math.floor((m + d) / 12), (m + d + 12) % 12];

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

function EventDetails({ event, onArtist, onBack }) {
  return (
    <div className="hp-details" key={event._id}>
      {event.poster?.url && <img className="hp-poster" src={imageUrl(event.poster.url, 400)} alt={event.poster.alt ?? event.title} />}
      <h2>
        <button type="button" className="hp-back" onClick={onBack} aria-label="Back to the calendar">
          <span aria-hidden="true">←</span>
        </button>
        {event.title}
      </h2>
      <p className="ap-meta">{[formatDate(event.date), event.time, event.venue].filter(Boolean).join(" · ")}</p>
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
// onArtist(slug): opens an artist's page (from the lineup);
// onEventShown(bool): tells the header whether an event has taken the
// calendar's place; backRef: given a function that goes back to the calendar,
// for the header's happenings link to call.
export default function HappeningsPage({ open, onClose, onArtist, onEventShown, backRef }) {
  const [events, setEvents] = useState(null);
  // The months shown, and the one currently in view.
  const [thisMonth] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [chosenId, setChosenId] = useState(null);
  const scrollRef = useRef(null);
  const monthsRef = useRef(null);

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
  // The chosen event: nothing until a poster is clicked, so the calendar is
  // shown on its own first.
  const chosen = (events ?? []).find((e) => e._id === chosenId) ?? null;

  // On a narrow screen the details take the calendar's place rather than
  // sitting beside it (see index.css), so where the months were scrolled to is
  // kept and put back when the details close.
  const onePanel = () => window.matchMedia("(max-width: 900px)").matches;
  const calendarScroll = useRef(null);
  const choose = (id) => {
    const el = scrollRef.current;
    if (el && onePanel() && id && !chosenId) calendarScroll.current = el.scrollTop;
    setChosenId(id);
  };
  // The header needs to know when an event has the screen to itself, so its
  // happenings link goes back to the calendar rather than closing the view.
  useEffect(() => {
    const tell = () => onEventShown?.(Boolean(chosenId) && onePanel());
    tell();
    window.addEventListener("resize", tell);
    return () => {
      onEventShown?.(false);
      window.removeEventListener("resize", tell);
    };
  }, [chosenId, onEventShown]);

  // What the header's happenings link calls to come back to the calendar.
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => choose(null);
    return () => {
      backRef.current = null;
    };
  });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !onePanel()) return;
    // The details start at their top; closing them goes back to the month
    // that was on screen.
    if (chosenId) el.scrollTop = 0;
    else if (calendarScroll.current != null) {
      el.scrollTop = calendarScroll.current;
      calendarScroll.current = null;
    }
  }, [chosenId]);

  // Opening the calendar starts at this month.
  useLayoutEffect(() => {
    if (!open || !events) return;
    const months = monthsRef.current;
    const scroll = scrollRef.current;
    if (!months || !scroll) return;
    const here = months.children[MONTHS_EITHER_SIDE];
    if (here) scroll.scrollTop = here.offsetTop - months.offsetTop;
  }, [open, events]);

  // One month's grid of days.
  const monthGrid = (gy, gm) => {
    const firstDay = (new Date(gy, gm, 1).getDay() + 6) % 7;
    const count = new Date(gy, gm + 1, 0).getDate();
    const gcells = [...Array(firstDay).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
    const grid = (
      <div className="hp-grid">
        {DAYS.map((d) => (
          <div key={d} className="hp-dayname">
            <span className="hp-long">{d}</span>
            <span className="hp-short">{d.slice(0, 3)}</span>
          </div>
        ))}
        {gcells.map((d, i) => {
          // The days before the 1st keep their place in the first week.
          if (!d) return <div className="hp-blank" key={`blank${i}`} />;
          const date = iso(gy, gm, d);
          const dayEvents = byDate.get(date) ?? [];
          const ev = dayEvents[0];
          // Today counts as gone, so it's shaded like the days before it.
          const past = date <= today;
          const isChosen = ev && chosen && dayEvents.some((e) => e._id === chosen._id);
          return (
            <button
              type="button"
              key={date}
              className={`hp-day${past ? " past" : ""}${ev ? " has-event" : ""}${isChosen ? " chosen" : ""}`}
              disabled={!ev}
              onClick={() => {
                if (!ev) return;
                // Clicking a day steps through its events, then puts the
                // details away again.
                const at = dayEvents.findIndex((e) => e._id === chosen?._id);
                choose(at < 0 ? dayEvents[0]._id : (dayEvents[at + 1]?._id ?? null));
              }}
              aria-label={ev ? `${ev.title}, ${formatDate(date)}` : undefined}
            >
              {ev?.poster?.url ? <img src={imageUrl(ev.poster.url, 120)} alt="" loading="lazy" /> : <span className="hp-daynum">{d}</span>}
              {dayEvents.length > 1 && <span className="hp-more">+{dayEvents.length - 1}</span>}
            </button>
          );
        })}
      </div>
    );
    return (
      <div className="hp-month-block" key={`${gy}-${gm}`}>
        <div className="hp-month">
          <h2>
            {MONTHS[gm]} {gy}
          </h2>
        </div>
        {grid}
      </div>
    );
  };

  return (
    <div
      className={`artist-page happenings-page${open ? " open" : ""}${events ? " loaded" : ""}`}
      aria-hidden={!open}
      onClick={(e) => {
        const c = e.target.classList;
        if (e.target === e.currentTarget || c.contains("ap-scroll") || c.contains("hp-inner")) onClose();
      }}
    >
      <div className="ap-scroll" ref={scrollRef}>
        <div className={`ap-inner hp-inner${chosen ? " has-event" : ""}`}>
          <section className="hp-calendar">
            {/* Months one after another, scrolled through like any page. */}
            <div className="hp-months" ref={monthsRef}>
              {Array.from({ length: MONTHS_EITHER_SIDE * 2 + 1 }, (_, i) =>
                monthGrid(...shift(thisMonth.y, thisMonth.m, i - MONTHS_EITHER_SIDE)),
              )}
            </div>
          </section>
          <aside className="hp-side">
            {chosen ? (
              <EventDetails event={chosen} onArtist={onArtist} onBack={() => choose(null)} />
            ) : (
              events?.length === 0 && <p className="hp-empty">No happenings yet.</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
