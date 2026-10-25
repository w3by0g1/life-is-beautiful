import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPaperScene } from "./paperScene.js";
import { infoTextWidth, isTall, tallTextWidth } from "./layout.js";
import { ARTISTS } from "./artists.js";
import { fetchArtists, fetchInfo, fetchSettings } from "./sanity.js";
import { setInkLifespan } from "./ink.js";
import ArtistPage from "./ArtistPage.jsx";
import InfoText from "./InfoText.jsx";
import HappeningsPage from "./HappeningsPage.jsx";
import ContactPage from "./ContactPage.jsx";
import GalleryPage from "./GalleryPage.jsx";
import logoUrl from "./assets/logo.jpg";
import headerLogoUrl from "./assets/header-logo.png";

// The header links: each the view it opens (set capitalised; see index.css).
const NAV = ["home", "artists", "gallery", "happenings", "info", "contact"];

// How long (ms) the sheet waits for its settings before going ahead without
// them.
const SETTINGS_WAIT = 700;

// Which view the address asks for: "#artists" shows the artist list over the
// middle of the sheet, "#artists/<slug>" opens that artist's page over it,
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
  // Where the sheet rests (see the layout below), kept for the scene when it
  // is made.
  const restRef = useRef(0);

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
          onReady: () => !cancelled && setReady(true),
        });
      })
      .then((d) => {
        if (!d) return;
        if (cancelled) return d();
        dispose = d;
        sceneRef.current = d;
        d.setRest(restRef.current);
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

  // Where the logo rests, and how wide the info text is set.
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
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, []);

  // No drawing while the artists, the info, the gallery, the calendar or the
  // contact form are showing. The ink stays under the artist list and the
  // info text, and fades out behind the rest (back in on leaving).
  useEffect(() => {
    sceneRef.current?.setDrawing(view === "home", {
      inkShown: inkShownIn(view, artistSlug),
    });
  }, [view, artistSlug]);

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
      <header className={`site-header${ready ? " ready" : ""}`}>
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
                  if (item === "happenings" && eventShown)
                    calendarBack.current?.();
                  else goHome();
                }
              }}
            >
              {item}
            </a>
          ))}
        </nav>
      </header>
      <ul
        className={`artists${view === "artists" ? " open" : ""}${ready ? " ready" : ""}`}
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
