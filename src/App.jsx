import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPaperScene } from "./paperScene.js";
import { artistsLayout, infoLayout, infoTextWidth } from "./layout.js";
import { ARTISTS } from "./artists.js";
import { fetchArtists, fetchInfo } from "./sanity.js";
import ArtistPage, { RichText } from "./ArtistPage.jsx";
import HappeningsPage from "./HappeningsPage.jsx";
import logoUrl from "./assets/logo.jpg";
import headerLogoUrl from "./assets/header-logo.png";

const NAV = ["artists", "gallery", "happenings", "info"];

// Which view the address asks for: "#artists" pans the sheet over and shows
// the artist list, "#artists/<slug>" opens that artist's page over it,
// "#happenings" shows the calendar, "#info" pans the sheet the other way and
// shows the info text; anything else is the plain sheet.
const viewFromHash = () => {
  const h = window.location.hash;
  if (h.startsWith("#artists")) return "artists";
  if (h === "#happenings") return "happenings";
  if (h === "#info") return "info";
  return "home";
};

// Shown until the info text loads from Sanity (or if it can't).
const INFO_FALLBACK = [
  {
    _type: "block",
    _key: "info",
    markDefs: [],
    children: [
      {
        _key: "t",
        marks: [],
        text: "life is beautiful is a gesamtkunstwerk founded in early 2023 by artist & curator aloisius. the project includes an independent record label, a series of happenings and a multidisciplinary septet collective, including: THE NARRATOR, Bianca Scout, Isaiah Hull, abi asisa, NWAKKE, Jasper Maurice & aloisius.",
      },
    ],
  },
];
const artistFromHash = () => {
  const m = window.location.hash.match(/^#artists\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

function App() {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const sceneRef = useRef(null);
  const [view, setView] = useState(viewFromHash);
  const [artistSlug, setArtistSlug] = useState(artistFromHash);
  // The artists, from Sanity once loaded (the built-in list until then).
  const [artists, setArtists] = useState(() => ARTISTS.map((name) => ({ name, slug: name })));
  // Where the list sits (fixed-position CSS) and how far the sheet pans so the
  // logo sits to the list's right.
  const [layout, setLayout] = useState({ pan: 0, right: 0, top: 0, infoPan: 0, infoLeft: 0, infoWidth: 400 });
  const [info, setInfo] = useState(INFO_FALLBACK);
  const panTarget = view === "artists" ? layout.pan : view === "info" ? layout.infoPan : 0;
  const panRef = useRef(panTarget);
  // How far the artists and info views pan (set by the layout below before
  // the scene is made), so the sheet is built with that much paper either side.
  const panExtentRef = useRef({ left: 0, right: 0 });

  useEffect(() => {
    let dispose;
    let cancelled = false;
    createPaperScene(containerRef.current, logoUrl, { panExtent: panExtentRef.current }).then((d) => {
      if (cancelled) return d();
      dispose = d;
      sceneRef.current = d;
      d.setPan(panRef.current);
      d.setDrawing(viewFromHash() === "home");
    });
    return () => {
      cancelled = true;
      sceneRef.current = null;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchInfo()
      .then((text) => !cancelled && text?.length && setInfo(text))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchArtists()
      .then((list) => {
        if (!cancelled && list?.length) setArtists(list);
      })
      .catch((err) => console.warn("Could not load the artists from Sanity:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow the address (the header links), and Esc closes the list.
  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash());
      setArtistSlug(artistFromHash());
    };
    // Esc steps back: from an artist to the list, from the list to the sheet.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (artistFromHash()) window.location.hash = "artists";
      else if (viewFromHash() !== "home") window.location.hash = "";
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // The logo goes a little right of centre (as far as the list needs), with
  // the list right-aligned a gap to its left, centred on its middle (see
  // layout.js).
  useLayoutEffect(() => {
    const place = () => {
      const r = containerRef.current.getBoundingClientRect();
      const { pan, listRight } = artistsLayout(r.width, r.height, listRef.current.offsetWidth);
      const infoWidth = infoTextWidth(r.width);
      const { pan: infoPan, textLeft } = infoLayout(r.width, r.height, infoWidth);
      panExtentRef.current = { left: pan, right: -infoPan };
      sceneRef.current?.setPanExtent(panExtentRef.current);
      setLayout({
        pan,
        right: window.innerWidth - (r.left + listRight),
        top: r.top + r.height / 2,
        infoPan,
        infoLeft: r.left + textLeft,
        infoWidth,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
    // Re-placed when the list changes (its width decides the pan).
  }, [artists]);

  useEffect(() => {
    panRef.current = panTarget;
    sceneRef.current?.setPan(panTarget);
  }, [panTarget]);

  // No drawing while the artists or the calendar are showing: the ink fades
  // out, and back in on leaving.
  useEffect(() => {
    sceneRef.current?.setDrawing(view === "home");
  }, [view]);

  return (
    <>
      <div ref={containerRef} className="scene" />
      <header className="site-header">
        <a className="site-logo" href="#" aria-label="Home">
          <img src={headerLogoUrl} alt="" />
        </a>
        <nav>
          {NAV.map((item) => (
            <a
              key={item}
              href={`#${item}`}
              className={view === item ? "active" : undefined}
              onClick={(e) => {
                // Clicking the open view's link again closes it (from an
                // artist's page, it goes back to the list).
                if (view === item && !artistSlug) {
                  e.preventDefault();
                  window.location.hash = "";
                }
              }}
            >
              {item}
            </a>
          ))}
        </nav>
      </header>
      <ul
        ref={listRef}
        className={`artists${view === "artists" ? " open" : ""}`}
        style={{ right: layout.right, top: layout.top }}
        aria-hidden={view !== "artists"}
      >
        {artists.map(({ name, slug }, i) => (
          <li key={slug ?? name} style={{ "--i": i }}>
            <a href={`#artists/${encodeURIComponent(slug ?? name)}`} tabIndex={view === "artists" ? 0 : -1}>
              {name}
            </a>
          </li>
        ))}
      </ul>
      <div
        className={`info-text${view === "info" ? " open" : ""}`}
        style={{ left: layout.infoLeft, top: layout.top, width: layout.infoWidth }}
        aria-hidden={view !== "info"}
      >
        <RichText value={info} />
      </div>
      <ArtistPage slug={artistSlug} onClose={() => (window.location.hash = "artists")} />
      <HappeningsPage
        open={view === "happenings"}
        onClose={() => (window.location.hash = "")}
        onArtist={(slug) => (window.location.hash = `artists/${encodeURIComponent(slug)}`)}
      />
    </>
  );
}

export default App;
