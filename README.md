# Embossed Paper

An interactive sheet of embossed paper, rendered with three.js: a raised logo that rises in on load, paper texture with fibres, creases and scratches, drifting dust and fog, and a moving light (the mouse, or the phone's tilt). Press to deboss the logo, and drag to write in calligraphic ink that bleeds into the paper and fades after a few minutes.

Live: https://w3by0g1.github.io/life-is-beautiful/

## Running it

```sh
npm install
npm run dev         # local dev server
npm run dev:phone   # https on the local network, so phones share their tilt
npm run deploy      # build and publish to GitHub Pages
```

While developing, the Record and Recordings buttons record drawings into the intro bank (`src/assets/intro-path.json`) that replays after the logo embosses.

## Content (Sanity)

The artist list is managed in Sanity (project `3x555lnx`, dataset `production`), in the studio at https://embossed-paper.sanity.studio. The site reads it from Sanity's public API (`src/sanity.js`), with `src/artists.js` as the fallback.

```sh
cd studio
npm run dev      # studio locally, at http://localhost:3333
npm run deploy   # publish the studio to embossed-paper.sanity.studio
```

A new site address needs adding as a CORS origin before it can read the content: `cd studio && npx sanity cors add https://example.com --no-credentials`.

## Live drawing (Firebase)

Strokes are shared live between everyone on the site through a Firebase Realtime Database (project `life-is-beautiful-sketches`, "life is beautiful live sketch", in europe-west1); see `src/liveSketch.js`. Each stroke lasts 10 seconds (`INK_LIFESPAN` in `src/ink.js`), newcomers see everything still alive, and older strokes are deleted by whichever visitor notices them (the rules allow that once a stroke has outlived the ink, so they need redeploying if the lifespan changes much). The security rules are in `firebase/database.rules.json`:

```sh
cd firebase && firebase deploy --only database   # publish rule changes
```
