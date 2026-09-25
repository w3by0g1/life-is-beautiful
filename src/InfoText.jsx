import { useLayoutEffect, useRef } from "react";
import { BandcampIcon, InstagramIcon } from "./ArtistPage.jsx";

// The info text (#info), set word by word so it can blur into focus a line at
// a time, like the artist names. Which line each word falls on is only known
// once it's laid out, so the words are measured after rendering (and again
// whenever the text is re-laid out).

// Sanity rich text → words, keeping each one's marks (bold, italic, links).
const wordsOf = (blocks) =>
  (blocks ?? [])
    .filter((b) => b._type === "block")
    .map((b) =>
      (b.children ?? []).flatMap((span, si) =>
        span.text
          .split(/(\s+)/)
          .filter(Boolean)
          .map((text, wi) => ({ key: `${span._key ?? si}-${wi}`, text, marks: span.marks ?? [], markDefs: b.markDefs })),
      ),
    );

function Word({ word }) {
  let node = word.text;
  for (const mark of word.marks) {
    if (mark === "strong") node = <strong>{node}</strong>;
    else if (mark === "em") node = <em>{node}</em>;
    else {
      const def = word.markDefs?.find((d) => d._key === mark);
      if (def?.href)
        node = (
          <a href={def.href} target="_blank" rel="noreferrer">
            {node}
          </a>
        );
    }
  }
  return <span className="info-word">{node}</span>;
}

// value: the rich text; width: its column (re-measured when it changes);
// bandcamp/instagram: links, shown as marks under the text.
export default function InfoText({ value, width, bandcamp, instagram }) {
  const ref = useRef(null);
  const paragraphs = wordsOf(value);

  // Each word is told which line it ended up on, so its fade can wait its turn.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      let line = -1;
      let lastTop = null;
      for (const word of el.querySelectorAll(".info-word")) {
        const top = Math.round(word.offsetTop);
        if (lastTop === null || top > lastTop + 2) {
          line++;
          lastTop = top;
        }
        word.style.setProperty("--i", line);
      }
      // The marks follow the last line in.
      el.querySelector(".info-links")?.style.setProperty("--i", line + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    // Word shapes settle once the font has loaded.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, [value, width]);

  return (
    <div ref={ref}>
      {paragraphs.map((words, i) => (
        <p key={i}>
          {words.map((word) => (word.text.trim() ? <Word key={word.key} word={word} /> : " "))}
        </p>
      ))}
      {(bandcamp || instagram) && (
        <div className="ap-links info-links">
          {bandcamp && (
            <a href={bandcamp} target="_blank" rel="noreferrer" aria-label="Bandcamp">
              <BandcampIcon />
            </a>
          )}
          {instagram && (
            <a href={instagram} target="_blank" rel="noreferrer" aria-label="Instagram">
              <InstagramIcon />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
