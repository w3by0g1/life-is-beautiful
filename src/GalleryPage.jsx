import { useEffect, useRef, useState } from "react";
import { fetchGallery, imageUrl } from "./sanity.js";

// The gallery (#gallery), over the blurred sheet like the calendar: the
// images from the studio's Gallery in rows that run off to the right and
// scroll sideways, each image its own shape, laid in whichever row is
// shortest so far (a masonry turned on its side). Clicking one shows it large
// with its caption and credit, with the ones either side a click (or an arrow
// key, or a swipe) away.

// The sizes (CSS px) the images are loaded at: in the rows, and large.
const GRID_W = 480;
const LARGE_W = 1200;

// How many rows the images go in: a third on a tall screen.
const rowCount = () => (window.innerHeight >= 1000 ? 3 : 2);

// Starts an image downloading (once), so it's ready when it's stepped to.
const preloaded = new Set();
const preload = (url) => {
  if (!url || preloaded.has(url)) return;
  preloaded.add(url);
  const im = new Image();
  im.decoding = "async";
  im.src = url;
};

// The caption and credit, for a label.
const credits = (img) => [img.caption?.trim(), img.credit?.trim()].filter(Boolean);

// An image that keeps its space from the start (from its proportions) and
// fades in once loaded, over a smaller copy already loaded (`under`, the
// rows' size) if there is one.
function Photo({ img, width, under, className = "", eager = false }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`gl-photo${loaded ? " loaded" : ""} ${className}`} style={{ "--ar": img.aspect ?? 0.8 }}>
      {under && <img className="gl-under" src={imageUrl(img.url, under)} alt="" aria-hidden="true" />}
      <img
        className="gl-full"
        ref={(el) => {
          if (el?.complete && el.naturalWidth) setLoaded(true);
        }}
        src={imageUrl(img.url, width)}
        alt={img.alt ?? img.caption ?? ""}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function Credits({ img }) {
  const [caption, credit] = [img.caption?.trim(), img.credit?.trim()];
  if (!caption && !credit) return null;
  return (
    <figcaption className="gl-caption">
      {caption && <span>{caption}</span>}
      {credit && <span className="gl-credit">{credit}</span>}
    </figcaption>
  );
}

// open: whether the gallery is showing; onClose: back to the sheet.
export default function GalleryPage({ open, onClose }) {
  const [images, setImages] = useState(null);
  // Which image is shown large (its index), or null for the rows.
  const [shown, setShown] = useState(null);
  // Coming back to the gallery starts with none shown large.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setShown(null);
  }

  useEffect(() => {
    if (!open || images) return;
    let cancelled = false;
    fetchGallery()
      .then((list) => !cancelled && setImages((list ?? []).filter((i) => i?.url)))
      .catch(() => !cancelled && setImages([]));
    return () => {
      cancelled = true;
    };
  }, [open, images]);

  const swipeRef = useRef(null);
  const count = images?.length ?? 0;

  // Each image goes in whichever row is shortest so far (by how wide its
  // images add up to, all being the same height), so the rows come out about
  // even and still run in the studio's order from the left.
  const [rowsN, setRowsN] = useState(rowCount);
  useEffect(() => {
    const onResize = () => setRowsN(rowCount());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const rows = Array.from({ length: rowsN }, () => ({ width: 0, items: [] }));
  images?.forEach((img, i) => {
    const row = rows.reduce((a, b) => (b.width < a.width ? b : a));
    row.items.push([img, i]);
    row.width += img.aspect ?? 0.8;
  });

  // An ordinary mouse wheel scrolls the rows sideways (a trackpad's sideways
  // swipe already does).
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Coming back to the gallery starts from the left.
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [open]);

  // The ones either side of the one shown large are fetched ahead.
  useEffect(() => {
    if (shown === null || !count) return;
    for (const d of [1, -1]) preload(imageUrl(images[(shown + d + count) % count].url, LARGE_W));
  }, [shown, count, images]);
  const step = (d) => setShown((i) => (i === null || !count ? i : (i + d + count) % count));

  // While one is shown large: the arrow keys step through them, and Esc puts
  // it away (before the page's own Esc, which would close the gallery).
  useEffect(() => {
    if (!open || shown === null) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setShown(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const large = shown !== null ? images?.[shown] : null;

  return (
    <div
      className={`artist-page gallery-page${open ? " open" : ""}${images ? " loaded" : ""}`}
      aria-hidden={!open}
      onClick={(e) => {
        // Clicking anywhere but an image goes back to the sheet.
        const c = e.target.classList;
        if (e.target === e.currentTarget || c.contains("gl-scroll") || c.contains("gl-rows") || c.contains("gl-row")) onClose();
      }}
    >
      <div className="gl-scroll" ref={scrollRef}>
        {images?.length === 0 && <p className="gl-empty">Nothing in the gallery yet.</p>}
        <div className="gl-rows" style={{ "--rows": rowsN }}>
          {rows.map((row, r) => (
            <div className="gl-row" key={r}>
              {row.items.map(([img, i]) => (
                <button
                  type="button"
                  className="gl-open"
                  key={img._key}
                  style={{ "--ar": img.aspect ?? 0.8 }}
                  onClick={() => setShown(i)}
                  tabIndex={open ? 0 : -1}
                  aria-label={`Show ${credits(img).join(", ") || `image ${i + 1}`} large`}
                >
                  <Photo img={img} width={GRID_W} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* One image large, over the rows. Clicking around it puts it away. */}
      <div
        className={`gl-large${large ? " open" : ""}`}
        aria-hidden={!large}
        onClick={(e) => {
          if (e.target === e.currentTarget) setShown(null);
        }}
        // A sideways swipe steps to the next or previous one.
        onTouchStart={(e) => (swipeRef.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - (swipeRef.current ?? e.changedTouches[0].clientX);
          swipeRef.current = null;
          if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
        }}
      >
        {large && (
          <figure className="gl-large-figure" key={large._key} onClick={(e) => e.target === e.currentTarget && setShown(null)}>
            <Photo img={large} width={LARGE_W} under={GRID_W} className="gl-large-photo" eager />
            <Credits img={large} />
          </figure>
        )}
        {count > 1 && (
          <>
            <button type="button" className="gl-step gl-prev" onClick={() => step(-1)} aria-label="Previous image" tabIndex={large ? 0 : -1}>
              <span aria-hidden="true">←</span>
            </button>
            <button type="button" className="gl-step gl-next" onClick={() => step(1)} aria-label="Next image" tabIndex={large ? 0 : -1}>
              <span aria-hidden="true">→</span>
            </button>
          </>
        )}
        <button type="button" className="gl-close" onClick={() => setShown(null)} aria-label="Back to the gallery" tabIndex={large ? 0 : -1}>
          close
        </button>
      </div>
    </div>
  );
}
