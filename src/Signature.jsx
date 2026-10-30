import { useEffect, useState } from "react";
import introBank from "./assets/intro-path.json";
import { recordingsIn } from "./intro.js";

// The site's name at the top left of the header: one of the drawings
// recorded for the intro (see intro.js), picked at random, set in the
// calligraphy pen's hand (a broad nib held at a slant, thick one way and fine
// the other, fuller where the pen moved slowly) but crisp, with no ink bleed.
// It writes itself out once the header appears, in WRITE seconds whatever
// its length: each step of the nib shows when it was drawn, in proportion.
// Every REDRAW seconds it fades away and
// another random one (or the same, if there's only one) is written out.

// How long it takes to write out (seconds), sped up or slowed to fit.
const WRITE = 3;
// Seconds between redraws, and how long the old one takes to fade away (ms;
// the .signature transition in index.css).
const REDRAW = 15;
const CLEAR_MS = 1500;
// How tall it's shown (CSS px; the height of .signature in index.css), and
// the room left around the line inside that.
const HEIGHT = 65;
const PAD = 3;
// The nib: its length (CSS px, as shown) and how it's held (degrees; negative
// tilts it up to the right, as the calligraphy pen in ink.js is).
const NIB = 5.4;
const NIB_ANGLE = -50;
// The line's width as a fraction of the nib when the pen moved slowly and
// fast, thinnest at FAST_AT (CSS px/s as drawn, on a screen whose shorter
// side was DRAWN_AT px), and the hairline it never goes below (CSS px).
const WIDTH_SLOW = 1;
const WIDTH_FAST = 0.25;
const FAST_AT = 900;
const DRAWN_AT = 900;
const HAIR = 0.5;
// How finely the curve through the pen's points is stepped (CSS px).
const STEP = 1.5;

const DOWN = 0;
const MOVE = 1;

// A recording's pen strokes: the points ([ms, x, y]) of each press, from the
// pen going down to it coming up.
function strokesOf(events) {
  const strokes = [];
  let stroke = null;
  for (const [type, ms, x, y] of events) {
    if (type === DOWN) strokes.push((stroke = [[ms, x, y]]));
    else if (type === MOVE) stroke?.push([ms, x, y]);
    else stroke = null;
  }
  return strokes;
}

const num = (v) => +v.toFixed(5);

// The parallelogram the nib sweeps from a to b (each [x, y, nx, ny]: a point
// and the nib's half-vector there), wound the same way whichever way it runs
// so overlapping steps don't cancel out.
function sweep([ax, ay, anx, any], [bx, by, bnx, bny]) {
  let pts = [
    [ax + anx, ay + any],
    [bx + bnx, by + bny],
    [bx - bnx, by - bny],
    [ax - anx, ay - any],
  ];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % 4];
    area += x0 * y1 - x1 * y0;
  }
  if (area < 0) pts = pts.reverse();
  return `M${pts.map(([x, y]) => `${num(x)} ${num(y)}`).join("L")}Z`;
}

// A random recording, laid out: its viewBox, and each step of the nib (its
// shape and when it shows, s).
function pick() {
  const bank = recordingsIn(introBank);
  if (!bank.length) return null;
  const strokes = strokesOf(bank[Math.floor(Math.random() * bank.length)]);
  const points = strokes.flat();
  if (!points.length) return null;
  const xs = points.map((p) => p[1]);
  const ys = points.map((p) => p[2]);
  // Recording units per CSS px as shown.
  const u = (Math.max(...ys) - Math.min(...ys)) / (HEIGHT - 2 * PAD) || 0.001;
  const [x0, y0] = [Math.min(...xs) - PAD * u, Math.min(...ys) - PAD * u];
  const [w, h] = [Math.max(...xs) + PAD * u - x0, HEIGHT * u];
  const t0 = points[0][0];
  const angle = (NIB_ANGLE * Math.PI) / 180;
  const half = (width) => [
    (Math.cos(angle) * NIB * u * width) / 2,
    (Math.sin(angle) * NIB * u * width) / 2,
  ];

  const steps = [];
  for (const s of strokes) {
    // A single point (a dot): a short step across it.
    const raw =
      s.length > 1
        ? s
        : [
            [s[0][0], s[0][1] - u / 2, s[0][2]],
            [s[0][0], s[0][1] + u / 2, s[0][2]],
          ];
    // The pen's jitter smoothed out (its ends kept where they were).
    const pts = raw.map((p, i) =>
      i === 0 || i === raw.length - 1
        ? p
        : [
            p[0],
            (raw[i - 1][1] + 2 * p[1] + raw[i + 1][1]) / 4,
            (raw[i - 1][2] + 2 * p[2] + raw[i + 1][2]) / 4,
          ],
    );
    // The line's width at each point, from how fast the pen was moving.
    const widths = [WIDTH_SLOW];
    for (let i = 1; i < pts.length; i++) {
      const dt = Math.max(1, pts[i][0] - pts[i - 1][0]) / 1000;
      const speed =
        (Math.hypot(pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]) *
          DRAWN_AT) /
        dt;
      const target =
        WIDTH_SLOW + (WIDTH_FAST - WIDTH_SLOW) * Math.min(1, speed / FAST_AT);
      widths.push(widths[i - 1] + (target - widths[i - 1]) * 0.3);
    }
    // A curve through the points (Catmull-Rom), in steps of about STEP px,
    // its times and widths eased along between them.
    let prev = [pts[0][1], pts[0][2], ...half(widths[0])];
    for (let i = 0; i < pts.length - 1; i++) {
      const [p0, p1, p2, p3] = [
        pts[i - 1] ?? pts[i],
        pts[i],
        pts[i + 1],
        pts[i + 2] ?? pts[i + 1],
      ];
      const n = Math.max(
        1,
        Math.ceil(Math.hypot(p2[1] - p1[1], p2[2] - p1[2]) / u / STEP),
      );
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const at = (j) =>
          0.5 *
          (2 * p1[j] +
            (p2[j] - p0[j]) * f +
            (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * f * f +
            (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * f * f * f);
        const next = [
          at(1),
          at(2),
          ...half(widths[i] + (widths[i + 1] - widths[i]) * f),
        ];
        steps.push({ d: sweep(prev, next), t: p1[0] + (p2[0] - p1[0]) * f });
        prev = next;
      }
    }
  }
  // Its times fitted to WRITE seconds.
  const span = Math.max(1, steps.at(-1)?.t - t0 || 1);
  return {
    viewBox: `${num(x0)} ${num(y0)} ${num(w)} ${num(h)}`,
    aspect: w / h,
    hair: HAIR * u,
    steps: steps.map(({ d, t }) => ({ d, at: ((t - t0) / span) * WRITE })),
  };
}

// fallback: shown instead if there's no recording to show.
export default function Signature({ fallback = null }) {
  const [drawing, setDrawing] = useState(pick);
  // Which redraw this is (a new one mounts fresh paths, so the steps write
  // out again), and whether the last is fading away.
  const [run, setRun] = useState(0);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let swap;
    const timer = setInterval(() => {
      setClearing(true);
      swap = setTimeout(() => {
        setDrawing(pick());
        setRun((r) => r + 1);
        setClearing(false);
      }, CLEAR_MS);
    }, REDRAW * 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(swap);
    };
  }, []);

  if (!drawing) return fallback;
  return (
    <svg
      key={run}
      className={`signature${clearing ? " clearing" : ""}`}
      viewBox={drawing.viewBox}
      style={{ "--aspect": drawing.aspect }}
      strokeWidth={drawing.hair}
      aria-hidden="true"
    >
      {drawing.steps.map((step, i) => (
        <path key={i} d={step.d} style={{ animationDelay: `${step.at}s` }} />
      ))}
    </svg>
  );
}
