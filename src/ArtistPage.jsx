import { useEffect, useState } from "react";
import { fetchArtist, imageUrl } from "./sanity.js";

// An artist's page, over the blurred, lightened sheet: their artwork, name and
// description on the left, and their albums, singles and media (from Sanity,
// in the order set there) on the right.

// "2026-04-09" → "APRIL 9, 2026".
const formatDate = (date) =>
  date
    ? new Date(`${date}T00:00:00Z`)
        .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
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
      Listen
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
      <img className="ap-art" src={imageUrl(item.artwork?.url, 240)} alt={item.artwork?.alt ?? item.title} />
      <div>
        <ReleaseText item={item} kind={tracks.length ? `${tracks.length} track album` : "album"} />
        {tracks.length > 0 && (
          <ol className="ap-tracks">
            {tracks.map((t, i) => (
              <li key={t._key}>
                {/* A number on a filled dot, as in the design. */}
                <span className="ap-track-no">
                  <span className="ap-track-dot">{i + 1}</span>
                </span>
                <strong>{t.title}</strong> {t.credit || artistName}
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

function Single({ item }) {
  return (
    <article className="ap-release ap-single">
      <img className="ap-art" src={imageUrl(item.artwork?.url, 170)} alt={item.artwork?.alt ?? item.title} />
      <ReleaseText item={item} kind="single" />
    </article>
  );
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
    <div className={`ap-media ap-media-single ap-align-${item.alignment ?? "center"}`}>
      {items.slice(0, 1).map((m) => (
        <MediaItem key={m._key} m={m} width={340} />
      ))}
    </div>
  );
}

// Bandcamp and Instagram marks, drawn to sit with the grey text.
const BandcampIcon = () => (
  <svg viewBox="0 0 64 28" width="58" height="26" aria-hidden="true">
    <path d="M10 5h16L18 23H2z" fill="currentColor" />
    <text x="30" y="21" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontSize="19" fontWeight="500" fill="currentColor">
      bc
    </text>
  </svg>
);
const InstagramIcon = () => (
  <svg viewBox="0 0 28 28" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2">
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

  return (
    <div
      className={`artist-page${open ? " open" : ""}${shown ? " loaded" : ""}`}
      aria-hidden={!open}
      onClick={(e) => {
        // Clicking the blurred background (not the content) closes it.
        const c = e.target.classList;
        if (e.target === e.currentTarget || c.contains("ap-scroll") || c.contains("ap-inner")) onClose();
      }}
    >
      {open && error && !shown && <p className="ap-missing">This artist couldn't be loaded.</p>}
      {/* Scrolls over the fixed, blurred background, fading out at its top and
          bottom edges. */}
      <div className="ap-scroll">
        {artist && (
          <div className="ap-inner">
            <aside className="ap-profile">
              {artist.artwork?.url && (
                <img className="ap-portrait" src={imageUrl(artist.artwork.url, 520)} alt={artist.artwork.alt ?? artist.name} />
              )}
              <a
                className="ap-back"
                href="#artists"
                onClick={(e) => {
                  e.preventDefault();
                  onClose();
                }}
              >
                <span aria-hidden="true">←</span> {artist.name}
              </a>
              <div className="ap-rich ap-bio">
                <RichText value={artist.description} />
              </div>
              <div className="ap-links">
                {artist.bandcamp && (
                  <a href={artist.bandcamp} target="_blank" rel="noreferrer" aria-label="Bandcamp">
                    <BandcampIcon />
                  </a>
                )}
                {artist.instagram && (
                  <a href={artist.instagram} target="_blank" rel="noreferrer" aria-label="Instagram">
                    <InstagramIcon />
                  </a>
                )}
              </div>
            </aside>
            <section className="ap-content">
              {(artist.content ?? []).map((item) =>
                item._type === "album" ? (
                  <Album key={item._key} item={item} artistName={artist.name} />
                ) : item._type === "single" ? (
                  <Single key={item._key} item={item} />
                ) : item._type === "media" ? (
                  <Media key={item._key} item={item} />
                ) : null,
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
