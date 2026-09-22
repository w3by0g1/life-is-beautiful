# Embossed Paper

An interactive sheet of embossed paper, rendered with three.js: a raised logo that rises in on load, paper texture with fibres, creases and scratches, drifting dust and fog, and a moving light (the mouse, or the phone's tilt). Press to deboss the logo, and drag to write in calligraphic ink that bleeds into the paper and fades after a few minutes.

Live: https://w3by0g1.github.io/embossed-paper/

## Running it

```sh
npm install
npm run dev         # local dev server
npm run dev:phone   # https on the local network, so phones share their tilt
npm run deploy      # build and publish to GitHub Pages
```

While developing, the Record and Recordings buttons record drawings into the intro bank (`src/assets/intro-path.json`) that replays after the logo embosses.
