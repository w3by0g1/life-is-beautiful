import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchArtist, imageUrl } from "./sanity.js";

// An artist's page, over the blurred, lightened sheet: their artwork, name and
// description on the left, and their albums, singles and media (from Sanity,
// in the order set there) on the right.

// "2026-04-09" → "APRIL 9, 2026".
const formatDate = (date) =>
  date
    ? new Date(`${date}T00:00:00Z`)
        .toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
        .toUpperCase()
    : null;

// Sanity rich text: paragraphs with bold, italic and links.
export function RichText({ value }) {
  if (!value?.length) return null;
  return value.map((block) => {
    if (block._type !== "block") return null;
    return (
      <p key={block._key}>
        {block.children?.map((span) => {
          let node = span.text;
          for (const mark of span.marks ?? []) {
            if (mark === "strong") node = <strong>{node}</strong>;
            else if (mark === "em") node = <em>{node}</em>;
            else {
              const def = block.markDefs?.find((d) => d._key === mark);
              if (def?.href)
                node = (
                  <a href={def.href} target="_blank" rel="noreferrer">
                    {node}
                  </a>
                );
            }
          }
          return <span key={span._key}>{node}</span>;
        })}
      </p>
    );
  });
}

// A line of details (a date, a time, a place), with the dots set close to the
// words rather than a monospace space either side of them.
export function Meta({ parts, className = "ap-meta" }) {
  const items = parts.filter(Boolean);
  if (!items.length) return null;
  return (
    <p className={className}>
      {items.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="meta-dot">·</span>}
          {part}
        </span>
      ))}
    </p>
  );
}

function Listen({ href }) {
  if (!href) return null;
  return (
    <a className="ap-listen" href={href} target="_blank" rel="noreferrer">
      listen
    </a>
  );
}

function ReleaseText({ item, kind }) {
  return (
    <div className="ap-release-text">
      <div className="ap-release-head">
        <h3>{item.title}</h3>
        <Listen href={item.link} />
      </div>
      <Meta parts={[formatDate(item.date), kind]} />
      <div className="ap-rich">
        <RichText value={item.description} />
      </div>
    </div>
  );
}

function Album({ item, artistName }) {
  const tracks = item.tracklist ?? [];
  return (
    <article className="ap-release ap-album">
      <img
        className="ap-art"
        src={imageUrl(item.artwork?.url, 240)}
        alt={item.artwork?.alt ?? item.title}
      />
      <div>
        <ReleaseText
          item={item}
          kind={tracks.length ? `${tracks.length} track album` : "album"}
        />
        {tracks.length > 0 && (
          // Ruled off from the notes above, where there are any.
          <ol className={`ap-tracks${item.description?.length ? " ap-tracks-ruled" : ""}`}>
            {tracks.map((t, i) => (
              <li key={t._key}>
                {/* A number on a filled dot, as in the design. */}
                <span className="ap-track-no">
                  <span className="ap-track-dot">{i + 1}</span>
                </span>
                <strong>{t.title}</strong> <span className="ap-track-by">{t.credit || artistName}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

// A single: its artwork beside the writing on its own, or stacked above it
// when it's one of a row of them (see the grouping below).
function Single({ item, tile }) {
  return (
    <article className={`ap-release ap-single${tile ? " ap-single-tile" : ""}`}>
      <img
        className="ap-art"
        src={imageUrl(item.artwork?.url, tile ? 340 : 170)}
        alt={item.artwork?.alt ?? item.title}
      />
      <ReleaseText item={item} kind="single" />
    </article>
  );
}

// Singles that follow one another go in a grid rather than a row each, which
// would leave most of the page empty. Everything else keeps its own row.
function groupSingles(content) {
  const out = [];
  for (const item of content ?? []) {
    const last = out[out.length - 1];
    if (item._type === "single" && last?.singles) last.items.push(item);
    else if (item._type === "single") out.push({ singles: true, key: item._key, items: [item] });
    else out.push({ key: item._key, item });
  }
  return out;
}

function MediaItem({ m, width }) {
  if (m._type === "video")
    return (
      <video
        src={m.url}
        poster={imageUrl(m.poster, width)}
        controls
        muted
        playsInline
        loop
        preload="metadata"
      />
    );
  return <img src={imageUrl(m.url, width)} alt={m.alt ?? ""} />;
}

function Media({ item }) {
  const items = item.items ?? [];
  if (item.layout === "double")
    return (
      <div className="ap-media ap-media-double">
        {items.slice(0, 2).map((m) => (
          <MediaItem key={m._key} m={m} width={340} />
        ))}
      </div>
    );
  return (
    <div
      className={`ap-media ap-media-single ap-align-${item.alignment ?? "center"}`}
    >
      {items.slice(0, 1).map((m) => (
        <MediaItem key={m._key} m={m} width={340} />
      ))}
    </div>
  );
}

// Bandcamp and Instagram marks, drawn to sit with the grey text (also used
// under the info text; see InfoText.jsx).
export const BandcampIcon = () => (
  <svg viewBox="0 0 64 28" width="58" height="26" aria-hidden="true">
    <path d="M10 5h16L18 23H2z" fill="currentColor" />
    <text
      x="30"
      y="21"
      fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
      fontSize="19"
      fontWeight="500"
      fill="currentColor"
    >
      bc
    </text>
  </svg>
);
export const InstagramIcon = () => (
  <svg
    viewBox="0 0 28 28"
    width="30"
    height="30"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
  >
    <rect x="2" y="2" width="24" height="24" rx="7" />
    <circle cx="14" cy="14" r="5.5" />
    <circle cx="21" cy="7" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

// slug: the artist to show (null when closed); onClose: back to the list.
export default function ArtistPage({ slug, onClose }) {
  // The loaded artist, remembered after closing so it can fade out.
  const [artist, setArtist] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchArtist(slug)
      .then((a) => {
        if (cancelled) return;
        setArtist(a);
        setError(!a);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const open = Boolean(slug);
  const shown = open && artist?.slug === slug ? artist : null;
  // What's on the page: the artist asked for once they've loaded, and while
  // the page closes, whoever was last shown (so they can fade out). Never the
  // artist before this one — they'd flash up while this one loads.
  const showing = open ? shown : artist;

  // A new artist starts at the top, not where the last one was scrolled to.
  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    if (shown && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [shown]);

  return (
    <div
      className={`artist-page${open ? " open" : ""}${shown ? " loaded" : ""}`}
      aria-hidden={!open}
      onClick={(e) => {
        // Clicking the blurred background (not the content) closes it.
        const c = e.target.classList;
        if (
          e.target === e.currentTarget ||
          c.contains("ap-scroll") ||
          c.contains("ap-inner")
        )
          onClose();
      }}
    >
      {open && error && !shown && (
        <p className="ap-missing">This artist couldn't be loaded.</p>
      )}
      {/* Scrolls over the fixed, blurred background, fading out at its top and
          bottom edges. */}
      <div className="ap-scroll" ref={scrollRef}>
        {showing && (
          <div className="ap-inner">
            <aside className="ap-profile">
              {showing.artwork?.url && (
                <img
                  className="ap-portrait"
                  src={imageUrl(showing.artwork.url, 520)}
                  alt={showing.artwork.alt ?? showing.name}
                />
              )}
              <a
                className="ap-back"
                href="#artists"
                onClick={(e) => {
                  e.preventDefault();
                  onClose();
                }}
              >
                <span aria-hidden="true">←</span> {showing.name}
              </a>
              <div className="ap-rich ap-bio">
                <RichText value={showing.description} />
              </div>
              <div className="ap-links">
                {showing.bandcamp && (
                  <a
                    href={showing.bandcamp}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Bandcamp"
                  >
                    <BandcampIcon />
                  </a>
                )}
                {showing.instagram && (
                  <a
                    href={showing.instagram}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Instagram"
                  >
                    <InstagramIcon />
                  </a>
                )}
              </div>
            </aside>
            <section className="ap-content">
              {groupSingles(showing.content).map((group) => {
                if (group.singles) {
                  // On its own a single keeps the wide layout; in company they
                  // share a grid.
                  if (group.items.length === 1) return <Single key={group.key} item={group.items[0]} />;
                  return (
                    <div className="ap-singles" key={group.key}>
                      {group.items.map((item) => (
                        <Single key={item._key} item={item} tile />
                      ))}
                    </div>
                  );
                }
                const item = group.item;
                return item._type === "album" ? (
                  <Album key={group.key} item={item} artistName={showing.name} />
                ) : item._type === "media" ? (
                  <Media key={group.key} item={item} />
                ) : null;
              })}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
