import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPaperScene } from "./paperScene.js";
import {
  artistsLayout,
  infoTextWidth,
  isTall,
  tallTextWidth,
} from "./layout.js";
import { ARTISTS } from "./artists.js";
import {
  currentPath,
  followLink,
  href,
  navigate,
  upgradeHashLink,
} from "./route.js";
import { fetchArtists, fetchInfo, fetchSettings } from "./sanity.js";
import { setInkLifespan } from "./ink.js";
import ArtistPage from "./ArtistPage.jsx";
import InfoText from "./InfoText.jsx";
import HappeningsPage from "./HappeningsPage.jsx";
import ContactPage from "./ContactPage.jsx";
import GalleryPage from "./GalleryPage.jsx";
import headerLogoUrl from "./assets/header-logo.png";
import logoUrl from "./assets/logo.jpg";

// The header links: the view each opens, how it reads, and, for one that
// leaves the site, where it goes (in a new tab). (Home is the site's name at
// the left of the header.)
const NAV = [
  ["artists", "artists"],
  ["gallery", "gallery"],
  ["happenings", "happenings"],
  ["merch", "merch", "https://lifeisbeautifulrecords.bandcamp.com/merch"],
  ["info", "info"],
  ["contact", "contact"],
];

// How long (ms) the sheet waits for its settings before going ahead without
// them.
const SETTINGS_WAIT = 700;

// An old "#artists" link becomes its path before anything reads the address.
upgradeHashLink();

// Which view the address asks for (see route.js): "artists" pans the sheet
// over and shows the artist list beside the logo, "artists/<slug>" opens that
// artist's page over it, "gallery" shows the gallery, "happenings" the
// calendar, "info" the info text over the middle of the sheet, "contact" the
// contact form; anything else is the plain sheet.
// The header link the address belongs to ("artists/aloisius" → "artists"),
// whether or not there's a view behind it yet.
const sectionFromPath = () => currentPath().split("/")[0];

const VIEWS = ["happenings", "gallery", "info", "contact"];
const viewFromPath = () => {
  const path = currentPath();
  if (path === "artists" || path.startsWith("artists/")) return "artists";
  return VIEWS.includes(path) ? path : "home";
};

// Whether a view sets its writing over the sheet (the artist list, but not an
// artist's page, and the info text).
const overSheet = (view, slug) =>
  (view === "artists" && !slug) || view === "info";

// Whether the drawings show in a view: on the plain sheet, and under the
// writing set over it.
const inkShownIn = (view, slug) =>
  view === "home" || overSheet(view, slug) ? 1 : 0;

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
// Back to the plain sheet.
const goHome = () => navigate("");

// The artist whose page the address asks for, if any.
const artistFromPath = () => {
  const m = currentPath().match(/^artists\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

// An artist's page, as a path.
const artistPath = (slug) => `artists/${encodeURIComponent(slug)}`;

function App() {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const [view, setView] = useState(viewFromPath);
  const [section, setSection] = useState(sectionFromPath);
  const [artistSlug, setArtistSlug] = useState(artistFromPath);
  // The artists, from Sanity once loaded (the built-in list until then).
  const [artists, setArtists] = useState(() =>
    ARTISTS.map((name) => ({ name, slug: name })),
  );
  // How wide the info text is set (see layout.js).
  const [infoWidth, setInfoWidth] = useState(400);
  // Where the artist list sits (fixed-position CSS) and how far the sheet pans
  // right so the logo makes room for it, the list beside it (see layout.js).
  const [listLayout, setListLayout] = useState({ pan: 0, right: 0, top: 0 });
  // The info text, with the marks that go under it (all from Sanity).
  const [info, setInfo] = useState({ text: INFO_FALLBACK });
  // Whether the sheet has appeared; until it has, the page is the paper's
  // gradient.
  const [ready, setReady] = useState(false);
  // Whether the happenings view is showing an event in place of the calendar
  // (it does that where there's only room for one; see HappeningsPage), and
  // the page's way back to the calendar.
  const [eventShown, setEventShown] = useState(false);
  const calendarBack = useRef(null);
  // Whether the header's menu is open (on a phone the links are behind a
  // button; see index.css).
  const [menuOpen, setMenuOpen] = useState(false);
  // Where the sheet rests (see the layout below), kept for the scene when it
  // is made.
  const restRef = useRef(0);
  // Only the artists view pans the sheet, across to the right.
  const listRef = useRef(null);
  const panX = view === "artists" ? listLayout.pan : 0;
  const panRef = useRef([panX, 0]);
  // How far the artists view pans (set by the layout below before the scene
  // is made), so the sheet is built with that much paper around it.
  const panExtentRef = useRef({ left: 0, right: 0, top: 0, bottom: 0 });

  useEffect(() => {
    let dispose;
    let cancelled = false;
    // How long a drawing stays is a setting in Sanity, and the ink is timed
    // from it, so it's read before the sheet is made. If it's slow to answer
    // the paper doesn't wait: the built-in lifespan stands for this visit.
    Promise.race([
      fetchSettings().catch(() => null),
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
        d.setDrawing(viewFromPath() === "home", {
          inkShown: inkShownIn(viewFromPath(), artistFromPath()),
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

  // Follow the address (links, and the back and forward buttons), and Esc
  // closes the list.
  useEffect(() => {
    const onAddress = () => {
      setView(viewFromPath());
      setSection(sectionFromPath());
      setArtistSlug(artistFromPath());
    };
    // Esc steps back: from an artist to the list, from the list to the sheet.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (artistFromPath()) navigate("artists");
      else if (viewFromPath() !== "home") goHome();
    };
    window.addEventListener("popstate", onAddress);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onAddress);
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
      panExtentRef.current = { left: pan, right: 0, top: 0, bottom: 0 };
      sceneRef.current?.setPanExtent(panExtentRef.current);
      setListLayout({
        pan,
        right: window.innerWidth - (r.left + listRight),
        // Level with the logo where it rests (the middle of what's on screen).
        top: r.top + r.height / 2 + restY,
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
    panRef.current = [panX, 0];
    sceneRef.current?.setPan(panX, 0);
  }, [panX]);

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
      <div ref={containerRef} className="scene" />
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
          href={href("")}
          aria-label="life is beautiful, home"
          onClick={(e) => {
            setMenuOpen(false);
            followLink(e, "");
          }}
        >
          <img
            className="header-logo"
            src={headerLogoUrl}
            alt=""
            draggable={false}
          />
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
          {NAV.map(([item, label, url], i) => (
            <a
              key={item}
              href={url ?? href(item)}
              {...(url && { target: "_blank", rel: "noreferrer" })}
              // The label again, for the width its bold self takes (index.css).
              data-label={label}
              className={section === item ? "active" : undefined}
              style={{ "--i": i }}
              onClick={(e) => {
                setMenuOpen(false);
                if (url) return;
                // Clicking the open view's link again closes it (from an
                // artist's page, it goes back to the list; from an event
                // filling the screen, back to the calendar).
                if (view === item && !artistSlug) {
                  e.preventDefault();
                  if (item === "happenings" && eventShown)
                    calendarBack.current?.();
                  else goHome();
                  return;
                }
                followLink(e, item);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      <ul
        ref={listRef}
        className={`artists${view === "artists" ? " open" : ""}${ready ? " ready" : ""}`}
        style={{ right: listLayout.right, top: listLayout.top }}
        aria-hidden={view !== "artists"}
      >
        {artists.map(({ name, slug }, i) => (
          <li key={slug ?? name} style={{ "--i": i }} data-label={name}>
            <a
              href={href(artistPath(slug ?? name))}
              onClick={(e) => followLink(e, artistPath(slug ?? name))}
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
      <ArtistPage slug={artistSlug} onClose={() => navigate("artists")} />
      <HappeningsPage
        open={view === "happenings"}
        onClose={goHome}
        onArtist={(slug) => navigate(artistPath(slug))}
        onEventShown={setEventShown}
        backRef={calendarBack}
      />
      <GalleryPage open={view === "gallery"} onClose={goHome} />
      <ContactPage open={view === "contact"} onClose={goHome} />
    </>
  );
}

export default App;
