import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPaperScene } from "./paperScene.js";
import {
  artistsLayout,
  artistsLayoutTall,
  infoTextWidth,
  isTall,
  tallTextLeft,
  tallTextWidth,
} from "./layout.js";
import { ARTISTS } from "./artists.js";
import { fetchArtists, fetchInfo, fetchSettings } from "./sanity.js";
import { setInkLifespan } from "./ink.js";
import ArtistPage from "./ArtistPage.jsx";
import InfoText from "./InfoText.jsx";
import HappeningsPage from "./HappeningsPage.jsx";
import ContactPage from "./ContactPage.jsx";
import GalleryPage from "./GalleryPage.jsx";
import Signature from "./Signature.jsx";
import headerLogoUrl from "./assets/header-logo.png";
import logoUrl from "./assets/logo.jpg";

// The header links: the view each opens, and how it reads. (Home is the
// site's name at the left of the header.)
const NAV = [
  ["artists", "artists"],
  ["gallery", "gallery"],
  ["happenings", "happenings"],
  ["info", "info"],
  ["contact", "contact"],
];

// How long (ms) the sheet waits for its settings before going ahead without
// them.
const SETTINGS_WAIT = 700;

// Which view the address asks for: "#artists" pans the sheet over and shows
// the artist list beside the logo, "#artists/<slug>" opens that artist's page over it,
// "#gallery" shows the gallery, "#happenings" shows the calendar, "#info"
// shows the info text over the middle of the sheet, "#contact" shows the
// contact form; anything else is the plain sheet.
// The header link the address belongs to ("#artists/aloisius" → "artists"),
// whether or not there's a view behind it yet.
const sectionFromHash = () =>
  window.location.hash.replace(/^#/, "").split("/")[0];

const viewFromHash = () => {
  const h = window.location.hash;
  if (h.startsWith("#artists")) return "artists";
  if (h === "#happenings") return "happenings";
  if (h === "#gallery") return "gallery";
  if (h === "#info") return "info";
  if (h === "#contact") return "contact";
  return "home";
};

// Whether a view sets its writing over the sheet (the artist list, but not an
// artist's page, and the info text), which fades back a little under it.
const overSheet = (view, slug) =>
  (view === "artists" && !slug) || view === "info";

// Whether the drawings show in a view: on the plain sheet, and under the
// writing set over it.
const inkShownIn = (view, slug) =>
  view === "home" || overSheet(view, slug) ? 1 : 0;

// The site's logo, at the left of the header when it isn't showing a drawing.
const HeaderLogo = () => (
  <img className="header-logo" src={headerLogoUrl} alt="" />
);

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
// Back to the plain sheet. Not by going to "#": the browser scrolls to the
// top for that, and on a phone the page is kept scrolled down behind the
// status bar (see fullBleed.js), so the sheet would jump for a frame before
// being put back. The address loses its hash without a scroll instead.
const goHome = () => {
  if (!window.location.hash) return;
  history.pushState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

const artistFromHash = () => {
  const m = window.location.hash.match(/^#artists\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

function App() {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const [view, setView] = useState(viewFromHash);
  const [section, setSection] = useState(sectionFromHash);
  const [artistSlug, setArtistSlug] = useState(artistFromHash);
  // The artists, from Sanity once loaded (the built-in list until then).
  const [artists, setArtists] = useState(() =>
    ARTISTS.map((name) => ({ name, slug: name })),
  );
  // How wide the info text is set (see layout.js).
  const [infoWidth, setInfoWidth] = useState(400);
  // Where the artist list sits (fixed-position CSS) and how far the sheet pans
  // so the logo makes room for it: right on a wide screen, with the list
  // beside the logo, and up on a narrow one (`tall`), with the list above it
  // (see layout.js).
  const [listLayout, setListLayout] = useState({
    tall: false,
    pan: 0,
    right: 0,
    top: 0,
    panY: 0,
    bottom: 0,
    left: 0,
    width: 0,
  });
  // The info text, with the marks that go under it (all from Sanity).
  const [info, setInfo] = useState({ text: INFO_FALLBACK });
  // Whether the sheet has appeared; until it has, the page is the paper's
  // gradient with the title on it.
  const [ready, setReady] = useState(false);
  // Whether the happenings view is showing an event in place of the calendar
  // (it does that where there's only room for one; see HappeningsPage), and
  // the page's way back to the calendar.
  const [eventShown, setEventShown] = useState(false);
  const calendarBack = useRef(null);
  // Whether the header's menu is open (on a phone the links are behind a
  // button; see index.css).
  const [menuOpen, setMenuOpen] = useState(false);
  // Whether the header shows the site's name as a drawing (see Signature.jsx)
  // or as text: a setting in Sanity, the drawing until it says otherwise.
  const [headerDrawing, setHeaderDrawing] = useState(true);
  // Where the sheet rests (see the layout below), kept for the scene when it
  // is made.
  const restRef = useRef(0);
  // Only the artists view pans the sheet: across on a wide screen, up on a
  // narrow one.
  const listRef = useRef(null);
  const panX = view === "artists" && !listLayout.tall ? listLayout.pan : 0;
  const panY = view === "artists" && listLayout.tall ? listLayout.panY : 0;
  const panRef = useRef([panX, panY]);
  // How far the artists view pans (set by the layout below before the scene
  // is made), so the sheet is built with that much paper around it.
  const panExtentRef = useRef({ left: 0, right: 0, top: 0, bottom: 0 });

  useEffect(() => {
    let dispose;
    let cancelled = false;
    // How long a drawing stays is a setting in Sanity, and the ink is timed
    // from it, so it's read before the sheet is made. If it's slow to answer
    // the paper doesn't wait: the built-in lifespan stands for this visit.
    const settings = fetchSettings().catch(() => null);
    settings.then(
      (s) => !cancelled && setHeaderDrawing(s?.headerDrawing !== false),
    );
    Promise.race([
      settings,
      new Promise((resolve) => setTimeout(resolve, SETTINGS_WAIT, null)),
    ])
      .then(
        (settings) =>
          settings?.strokeMinutes &&
          setInkLifespan(settings.strokeMinutes * 60),
      )
      .catch(() => {})
      .then(() => {
        if (cancelled) return null;
        return createPaperScene(containerRef.current, logoUrl, {
          panExtent: panExtentRef.current,
          onReady: () => !cancelled && setReady(true),
        });
      })
      .then((d) => {
        if (!d) return;
        if (cancelled) return d();
        dispose = d;
        sceneRef.current = d;
        d.setRest(restRef.current);
        d.setPan(...panRef.current);
        d.setDrawing(viewFromHash() === "home", {
          inkShown: inkShownIn(viewFromHash(), artistFromHash()),
        });
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
      .then(
        (loaded) =>
          !cancelled &&
          loaded &&
          setInfo({
            ...loaded,
            text: loaded.text?.length ? loaded.text : INFO_FALLBACK,
          }),
      )
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
      .catch((err) =>
        console.warn("Could not load the artists from Sanity:", err),
      );
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
      else if (viewFromHash() !== "home") goHome();
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Where the logo rests, how wide the info text is set, and where the artist
  // list goes with how far the sheet pans for it.
  useLayoutEffect(() => {
    const place = () => {
      const r = containerRef.current.getBoundingClientRect();
      const tall = isTall(r.width);
      const infoWidth = tall ? tallTextWidth(r.width) : infoTextWidth(r.width);
      // Where the logo rests: the middle of what's on screen, which on a phone
      // is below the middle of the scene (it runs up behind the status bar).
      const restY = -r.top + window.innerHeight / 2 - r.height / 2;
      sceneRef.current?.setRest(restY);
      restRef.current = restY;
      setInfoWidth(infoWidth);

      const list = listRef.current;
      const { pan, listRight } = artistsLayout(
        r.width,
        r.height,
        list.offsetWidth,
      );
      // What of the sheet is on screen, in the scene's own coordinates: it
      // starts above the top of the screen on phones (see fullBleed.js), the
      // header covers its first stretch, and a phone browser's bar floats over
      // the last.
      const shown = {
        top: 96 - r.top,
        bottom: window.innerHeight - 56 - r.top,
      };
      const { middle, listBottom } = artistsLayoutTall(
        r.width,
        r.height,
        list.offsetHeight,
        shown,
      );
      const panY = middle - (r.height / 2 + restY);
      panExtentRef.current = tall
        ? { left: 0, right: 0, top: panY, bottom: 0 }
        : { left: pan, right: 0, top: 0, bottom: 0 };
      sceneRef.current?.setPanExtent(panExtentRef.current);
      setListLayout({
        tall,
        pan,
        right: window.innerWidth - (r.left + listRight),
        top: r.top + r.height / 2,
        panY,
        bottom: r.top + listBottom,
        left: r.left + tallTextLeft(r.width),
        width: tallTextWidth(r.width),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    // And whenever the scene itself changes size: on a first visit the
    // stylesheet can arrive after this first runs, with the scene still 0px
    // tall, which would leave the logo resting half a screen low.
    // (And the list's, which decides the pan, as the names load and their
    // font settles.)
    const observer = new ResizeObserver(place);
    observer.observe(containerRef.current);
    observer.observe(listRef.current);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    panRef.current = [panX, panY];
    sceneRef.current?.setPan(panX, panY);
  }, [panX, panY]);

  // No drawing while the artists, the info, the gallery, the calendar or the
  // contact form are showing. The ink stays under the artist list and the
  // info text, and fades out behind the rest (back in on leaving).
  useEffect(() => {
    sceneRef.current?.setDrawing(view === "home", {
      inkShown: inkShownIn(view, artistSlug),
    });
  }, [view, artistSlug]);

  // Esc closes the menu (before the page's own Esc, which would close the
  // view behind it).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menuOpen]);

  return (
    <>
      <div
        ref={containerRef}
        className={`scene${overSheet(view, artistSlug) ? " dim" : ""}`}
      />
      {/* While the paper is being made, its name in the middle of the empty
          sheet; it fades away as the paper comes in. */}
      <div className={`opening${ready ? " gone" : ""}`} aria-hidden={ready}>
        life is beautiful
      </div>
      {/* Behind the header's menu on a phone: blurs the page, and a tap on it
          closes the menu. */}
      <div
        className={`menu-wash${menuOpen ? " open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <header
        className={`site-header${ready ? " ready" : ""}${view === "home" ? " home" : ""}${menuOpen ? " menu-open" : ""}`}
      >
        <a
          className="site-name"
          href="#"
          aria-label="life is beautiful, home"
          // Home without following the bare "#", which would scroll the page
          // to its very top: on a phone it's held scrolled down a little (see
          // fullBleed.js), so the sheet would jump for a frame.
          onClick={(e) => {
            e.preventDefault();
            setMenuOpen(false);
            goHome();
          }}
        >
          {headerDrawing ? (
            <Signature fallback={<HeaderLogo />} />
          ) : (
            <HeaderLogo />
          )}
        </a>
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? "Close the menu" : "Open the menu"}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span />
          <span />
        </button>
        <nav id="site-nav">
          {NAV.map(([item, label], i) => (
            <a
              key={item}
              href={`#${item}`}
              // The label again, for the width its bold self takes (index.css).
              data-label={label}
              className={section === item ? "active" : undefined}
              style={{ "--i": i }}
              onClick={(e) => {
                setMenuOpen(false);
                // Clicking the open view's link again closes it (from an
                // artist's page, it goes back to the list; from an event
                // filling the screen, back to the calendar).
                if (view === item && !artistSlug) {
                  e.preventDefault();
                  if (item === "happenings" && eventShown)
                    calendarBack.current?.();
                  else goHome();
                }
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      <ul
        ref={listRef}
        className={`artists${view === "artists" ? " open" : ""}${listLayout.tall ? " tall" : ""}${ready ? " ready" : ""}`}
        style={
          listLayout.tall
            ? {
                left: listLayout.left,
                width: listLayout.width,
                top: listLayout.bottom,
              }
            : { right: listLayout.right, top: listLayout.top }
        }
        aria-hidden={view !== "artists"}
      >
        {artists.map(({ name, slug }, i) => (
          <li key={slug ?? name} style={{ "--i": i }}>
            <a
              href={`#artists/${encodeURIComponent(slug ?? name)}`}
              tabIndex={view === "artists" ? 0 : -1}
            >
              {name}
            </a>
          </li>
        ))}
      </ul>
      <div
        className={`info-text${view === "info" ? " open" : ""}${ready ? " ready" : ""}`}
        style={{ width: infoWidth }}
        aria-hidden={view !== "info"}
      >
        <InfoText
          value={info.text}
          width={infoWidth}
          bandcamp={info.bandcamp}
          instagram={info.instagram}
        />
      </div>
      <ArtistPage
        slug={artistSlug}
        onClose={() => (window.location.hash = "artists")}
      />
      <HappeningsPage
        open={view === "happenings"}
        onClose={goHome}
        onArtist={(slug) =>
          (window.location.hash = `artists/${encodeURIComponent(slug)}`)
        }
        onEventShown={setEventShown}
        backRef={calendarBack}
      />
      <GalleryPage open={view === "gallery"} onClose={goHome} />
      <ContactPage open={view === "contact"} onClose={goHome} />
    </>
  );
}

export default App;
