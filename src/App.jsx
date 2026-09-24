import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPaperScene } from "./paperScene.js";
import { artistsLayout, artistsLayoutTall, infoLayout, infoLayoutTall, infoTextWidth, isTall, tallTextLeft, tallTextWidth } from "./layout.js";
import { ARTISTS } from "./artists.js";
import { fetchArtists, fetchInfo } from "./sanity.js";
import ArtistPage from "./ArtistPage.jsx";
import InfoText from "./InfoText.jsx";
import HappeningsPage from "./HappeningsPage.jsx";
import logoUrl from "./assets/logo.jpg";
import headerLogoUrl from "./assets/header-logo.png";

const NAV = ["artists", "gallery", "happenings", "info"];

// Which view the address asks for: "#artists" pans the sheet over and shows
// the artist list, "#artists/<slug>" opens that artist's page over it,
// "#happenings" shows the calendar, "#info" pans the sheet the other way and
// shows the info text; anything else is the plain sheet.
// The header link the address belongs to ("#artists/aloisius" → "artists"),
// whether or not there's a view behind it yet.
const sectionFromHash = () => window.location.hash.replace(/^#/, "").split("/")[0];

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
  const infoRef = useRef(null);
  const sceneRef = useRef(null);
  const [view, setView] = useState(viewFromHash);
  const [section, setSection] = useState(sectionFromHash);
  const [artistSlug, setArtistSlug] = useState(artistFromHash);
  // The artists, from Sanity once loaded (the built-in list until then).
  const [artists, setArtists] = useState(() => ARTISTS.map((name) => ({ name, slug: name })));
  // Where the list and the info text sit (fixed-position CSS) and how far the
  // sheet pans so the logo makes room for them: beside them on a wide screen,
  // and above or below them on a narrow one (`tall`; see layout.js).
  const [layout, setLayout] = useState({
    tall: false,
    pan: 0,
    right: 0,
    top: 0,
    infoPan: 0,
    infoLeft: 0,
    infoWidth: 400,
    artistsPanY: 0,
    listBottom: 0,
    infoPanY: 0,
    textTop: 0,
    left: 0,
  });
  const [info, setInfo] = useState(INFO_FALLBACK);
  // Whether the sheet has appeared; until it has, the page is the paper's
  // gradient with the title on it.
  const [ready, setReady] = useState(false);
  // Whether the happenings view is showing an event in place of the calendar
  // (it does that where there's only room for one; see HappeningsPage), and
  // the page's way back to the calendar.
  const [eventShown, setEventShown] = useState(false);
  const calendarBack = useRef(null);
  const open = view === "artists" ? "artists" : view === "info" ? "info" : null;
  const panX = !open || layout.tall ? 0 : open === "artists" ? layout.pan : layout.infoPan;
  const panY = !open || !layout.tall ? 0 : open === "artists" ? layout.artistsPanY : layout.infoPanY;
  const panRef = useRef([panX, panY]);
  // Where the sheet rests (see the layout below), kept for the scene when it
  // is made.
  const restRef = useRef(0);
  // How far the artists and info views pan (set by the layout below before
  // the scene is made), so the sheet is built with that much paper around it.
  const panExtentRef = useRef({ left: 0, right: 0, top: 0, bottom: 0 });

  useEffect(() => {
    let dispose;
    let cancelled = false;
    createPaperScene(containerRef.current, logoUrl, {
      panExtent: panExtentRef.current,
      onReady: () => !cancelled && setReady(true),
    }).then((d) => {
      if (cancelled) return d();
      dispose = d;
      sceneRef.current = d;
      d.setRest(restRef.current);
      d.setPan(...panRef.current);
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
      setSection(sectionFromHash());
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
      const tall = isTall(r.width);
      const infoWidth = tall ? tallTextWidth(r.width) : infoTextWidth(r.width);
      // The text is measured as it will be set, for the room it needs below
      // the logo.
      if (infoRef.current) infoRef.current.style.width = `${infoWidth}px`;
      const { pan, listRight } = artistsLayout(r.width, r.height, listRef.current.offsetWidth);
      const { pan: infoPan, textLeft } = infoLayout(r.width, r.height, infoWidth);
      // What of the sheet is on screen, in the scene's own coordinates: it
      // starts above the top of the screen on phones (see fullBleed.js), the
      // header covers its first stretch, and a phone browser's bar floats over
      // the last.
      const view = { top: 96 - r.top, bottom: window.innerHeight - 56 - r.top };
      // Where the logo rests: the middle of what's on screen, which on a phone
      // is below the middle of the scene (it runs up behind the status bar).
      const restY = -r.top + window.innerHeight / 2 - r.height / 2;
      sceneRef.current?.setRest(restY);
      restRef.current = restY;
      const rest = r.height / 2 + restY;
      const { middle: artistsMiddle, listBottom } = artistsLayoutTall(r.width, r.height, listRef.current.offsetHeight, view);
      const { middle: infoMiddle, textTop } = infoLayoutTall(r.width, r.height, infoRef.current?.offsetHeight ?? 0, view);
      const artistsPanY = artistsMiddle - rest;
      const infoPanY = infoMiddle - rest;
      panExtentRef.current = tall
        ? { left: 0, right: 0, top: artistsPanY, bottom: -infoPanY }
        : { left: pan, right: -infoPan, top: 0, bottom: 0 };
      sceneRef.current?.setPanExtent(panExtentRef.current);
      setLayout({
        tall,
        pan,
        right: window.innerWidth - (r.left + listRight),
        top: r.top + r.height / 2,
        infoPan,
        infoLeft: r.left + textLeft,
        infoWidth,
        artistsPanY,
        listBottom: r.top + listBottom,
        infoPanY,
        textTop: r.top + textTop,
        left: r.left + tallTextLeft(r.width),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
    // Re-placed when the list or the text changes (their size decides the pan).
  }, [artists, info]);

  useEffect(() => {
    panRef.current = [panX, panY];
    sceneRef.current?.setPan(panX, panY);
  }, [panX, panY]);

  // No drawing while the artists or the calendar are showing: the ink fades
  // out, and back in on leaving.
  useEffect(() => {
    sceneRef.current?.setDrawing(view === "home");
  }, [view]);

  return (
    <>
      <div ref={containerRef} className="scene" />
      {/* While the paper is being made, its name in the middle of the empty
          sheet; it fades away as the paper comes in. */}
      <div className={`opening${ready ? " gone" : ""}`} aria-hidden={ready}>
        life is beautiful
      </div>
      <header className={`site-header${ready ? " ready" : ""}`}>
        <a className="site-logo" href="#" aria-label="Home">
          <img src={headerLogoUrl} alt="" />
        </a>
        <nav>
          {NAV.map((item) => (
            <a
              key={item}
              href={`#${item}`}
              // The label again, for the width its bold self takes (index.css).
              data-label={item}
              className={section === item ? "active" : undefined}
              onClick={(e) => {
                // Clicking the open view's link again closes it (from an
                // artist's page, it goes back to the list; from an event
                // filling the screen, back to the calendar).
                if (view === item && !artistSlug) {
                  e.preventDefault();
                  if (item === "happenings" && eventShown) calendarBack.current?.();
                  else window.location.hash = "";
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
        className={`artists${view === "artists" ? " open" : ""}${layout.tall ? " tall" : ""}${ready ? " ready" : ""}`}
        style={
          layout.tall
            ? { left: layout.left, width: layout.infoWidth, top: layout.listBottom }
            : { right: layout.right, top: layout.top }
        }
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
        ref={infoRef}
        className={`info-text${view === "info" ? " open" : ""}${layout.tall ? " tall" : ""}${ready ? " ready" : ""}`}
        style={
          layout.tall
            ? { left: layout.left, top: layout.textTop, width: layout.infoWidth }
            : { left: layout.infoLeft, top: layout.top, width: layout.infoWidth }
        }
        aria-hidden={view !== "info"}
      >
        <InfoText value={info} width={layout.infoWidth} />
      </div>
      <ArtistPage slug={artistSlug} onClose={() => (window.location.hash = "artists")} />
      <HappeningsPage
        open={view === "happenings"}
        onClose={() => (window.location.hash = "")}
        onArtist={(slug) => (window.location.hash = `artists/${encodeURIComponent(slug)}`)}
        onEventShown={setEventShown}
        backRef={calendarBack}
      />
    </>
  );
}

export default App;
