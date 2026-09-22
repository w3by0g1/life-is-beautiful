// Generates the paper's textures: colour, surface relief and the embossed logo.
// Pure canvas/typed-array code with no three.js, so it can run in a Web Worker
// (see paperTextures.worker.js) and keep the page smooth while it works.
//
// Output is three RGBA8 arrays, rows ordered bottom-up for WebGL:
//   color   — sRGB paper colour
//   surface — R,G: surface normal x,y (fibres, pulp, scratches, creases)
//             B: fibre-only texture for ink wicking (0.5 = neutral)
//             A: grooves (scratches, valley folds) that ink pools in
//   logo    — R,G: logo normal x,y; B: logo height; A: where logo shadows can reach

// The logo's texture scale (see buildLogoHeight) on the desktop screen its
// relief strength was tuned on; see generatePaperTextures.
const LOGO_REF_K = 1.5

// The sheet's randomness comes from a seed, so rebuilding it (after a window
// resize) gives the same paper: the same creases, fibres and speckle, laid out
// over the new size. Each feature has its own stream, so one using more
// numbers at a bigger size doesn't shift the others.
let random = Math.random
function seedRandom(seed) {
  let a = seed >>> 0
  random = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// Gaussian blur approximated by three box blurs. Done in JS rather than with
// the canvas `filter` property, which Safari ignores.
function gaussianBlur(src, w, h, sigma) {
  const n = 3
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl--
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4))
  const a = Float32Array.from(src)
  const b = new Float32Array(src.length)
  const sums = new Float32Array(w)
  for (let pass = 0; pass < n; pass++) {
    const r = ((pass < m ? wl : wl + 2) - 1) / 2
    if (r < 1) continue
    boxBlurH(a, b, w, h, r)
    boxBlurV(b, a, w, h, r, sums)
  }
  return a
}

// Running-sum box blur along rows, clamping at the edges.
function boxBlurH(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1)
  const last = w - 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = src[row] * (r + 1)
    for (let k = 1; k <= r; k++) sum += src[row + (k < w ? k : last)]
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum * inv
      const add = x + r + 1
      const sub = x - r
      sum += src[row + (add < w ? add : last)] - src[row + (sub > 0 ? sub : 0)]
    }
  }
}

// Box blur down columns, done a row at a time with per-column running sums so
// memory is read in order (much faster than walking each column).
function boxBlurV(src, dst, w, h, r, sums) {
  const inv = 1 / (2 * r + 1)
  const last = h - 1
  for (let x = 0; x < w; x++) sums[x] = src[x] * (r + 1)
  for (let k = 1; k <= r; k++) {
    const row = (k < h ? k : last) * w
    for (let x = 0; x < w; x++) sums[x] += src[row + x]
  }
  for (let y = 0; y < h; y++) {
    const out = y * w
    const add = (y + r + 1 < h ? y + r + 1 : last) * w
    const sub = (y - r > 0 ? y - r : 0) * w
    for (let x = 0; x < w; x++) {
      dst[out + x] = sums[x] * inv
      sums[x] += src[add + x] - src[sub + x]
    }
  }
}

// Turn the dark-ink-on-white artwork into a smooth height field where only the
// ink is raised, each stroke as a soft rounded ridge.
function buildLogoHeight(img, w, h, S) {
  const size = S.logoBase * S.logoFraction
  const x = S.logoX - size / 2
  const y = (h - size) / 2
  // Blur radii were tuned for a ~635px logo; keep the profile consistent at any size.
  const k = size / 635

  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, x, y, size, size)
  const data = ctx.getImageData(0, 0, w, h).data
  const ink = new Float32Array(w * h)
  for (let i = 0; i < ink.length; i++) ink[i] = 1 - data[i * 4] / 255

  // A wide blur turns each stroke into a rounded, pillowy bump; a wider,
  // fainter one eases it into the surrounding paper. The raw Gaussian profile is
  // already dome-shaped, so it's used as-is rather than eased into a plateau.
  const height = gaussianBlur(ink, w, h, S.roundness * k)
  const shoulder = gaussianBlur(ink, w, h, S.roundness * 2.2 * k)
  let max = 0
  for (let i = 0; i < height.length; i++) {
    height[i] += shoulder[i] * 0.35
    if (height[i] > max) max = height[i]
  }
  // Normalise against a typical stroke, not the brightest overlap, so crossing
  // points don't make every other line look shallow.
  const scale = 1 / (max * 0.8)
  for (let i = 0; i < height.length; i++) height[i] = Math.min(1, height[i] * scale)
  return { height, k }
}

// Cotton-paper surface: fine grain plus scattered fibres, returned as a height field.
function buildFibreHeight(w, h) {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const g = 128 + (random() - 0.5) * 70
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)

  ctx.lineCap = 'round'
  const fibres = Math.round((w * h) / 160)
  for (let i = 0; i < fibres; i++) {
    const x = random() * w
    const y = random() * h
    const a = random() * Math.PI * 2
    const len = 6 + random() * 28
    const bend = (random() - 0.5) * len * 0.6
    ctx.strokeStyle = random() < 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'
    ctx.lineWidth = 0.6 + random() * 1.2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
      y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    )
    ctx.stroke()
  }

  const data = ctx.getImageData(0, 0, w, h).data
  const height = new Float32Array(w * h)
  for (let i = 0; i < height.length; i++) height[i] = (data[i * 4] - 128) / 128
  return gaussianBlur(height, w, h, 1)
}

// Pulp: uneven clumps of fibre, as small lumps plus broader soft undulations.
// Blurred white noise at two sizes, each normalised to unit spread so the
// strength doesn't depend on the blur. Added straight into `into`.
function addPulp(into, w, h, px, amount) {
  const noise = new Float32Array(w * h)
  for (let i = 0; i < noise.length; i++) noise[i] = random() * 2 - 1
  const rms = (a) => {
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += a[i] * a[i]
    return 1 / Math.sqrt(sum / a.length || 1)
  }
  const lumps = gaussianBlur(noise, w, h, 2.2 * px)
  const waves = gaussianBlur(noise, w, h, 7 * px)
  const kl = rms(lumps) * 0.55 * amount
  const kw = rms(waves) * 0.45 * amount
  for (let i = 0; i < into.length; i++) into[i] += lumps[i] * kl + waves[i] * kw
}

// Random curly strands, as polylines in texture pixels with a width and opacity.
// Each wanders: its heading turns by a curvature that itself drifts.
function makeFibrePaths(w, h, px, S) {
  const count = Math.round(((w * h) / (px * px)) * 0.00012 * S.fibres)
  const paths = []
  for (let n = 0; n < count; n++) {
    let x = random() * w
    let y = random() * h
    // Mostly level: the average of two randoms clusters tilts near zero.
    const tilt = ((random() + random() - 1) * S.fibreAngleSpread * Math.PI) / 180
    let heading = (random() < 0.5 ? 0 : Math.PI) + tilt
    let curl = (random() - 0.5) * 0.3 * S.fibreCurl
    const length = S.fibreLengthMin + random() * (S.fibreLengthMax - S.fibreLengthMin)
    const steps = Math.max(2, Math.round(length / 3))
    const points = [[x, y]]
    for (let i = 0; i < steps; i++) {
      curl += (random() - 0.5) * 0.12 * S.fibreCurl
      curl *= 0.88
      heading += curl
      x += Math.cos(heading) * 3 * px
      y += Math.sin(heading) * 3 * px
      points.push([x, y])
    }
    paths.push({
      points,
      width: (0.5 + random() ** 2 * 1.4) * px,
      alpha: 0.35 + random() * 0.55,
    })
  }
  return paths
}

function strokeFibres(ctx, paths, style) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const f of paths) {
    ctx.strokeStyle = style(f.alpha)
    ctx.lineWidth = f.width
    ctx.beginPath()
    ctx.moveTo(f.points[0][0], f.points[0][1])
    for (let i = 1; i < f.points.length; i++) ctx.lineTo(f.points[i][0], f.points[i][1])
    ctx.stroke()
  }
  ctx.restore()
}

// Scratches: mostly straight with a slight bend, tapering at both ends; some
// come as small clusters of parallel lines, like a fingernail or dragged edge.
// Each has a list of points and a depth; widths are in texture pixels.
function makeScratches(w, h, px, S) {
  const count = Math.round(((w * h) / (px * px)) * 0.000015 * S.scratches)
  const scratches = []
  for (let n = 0; n < count; n++) {
    const len = (30 + random() ** 1.5 * 220) * px
    const ang = random() * Math.PI
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    const bend = (random() - 0.5) * len * 0.12
    const x0 = random() * w
    const y0 = random() * h
    const lines = random() < 0.3 ? 2 + Math.floor(random() * 3) : 1
    for (let l = 0; l < lines; l++) {
      // Parallel companions sit a few pixels to the side, slightly shorter and offset.
      const off = l * (2 + random() * 3) * px
      const shrink = l ? 0.6 + random() * 0.4 : 1
      const shift = l ? (random() - 0.5) * len * 0.2 : 0
      const points = []
      for (let i = 0; i <= 24; i++) {
        const t = i / 24
        const along = (t - 0.5) * len * shrink + shift
        const side = off + bend * 4 * t * (1 - t)
        points.push([x0 + dx * along - dy * side, y0 + dy * along + dx * side])
      }
      scratches.push({
        points,
        width: (0.6 + random() * 0.8) * px,
        depth: 0.5 + random() * 0.5,
      })
    }
  }
  return scratches
}

// Draws scratches segment by segment so each one tapers in and out at its ends.
function strokeScratches(ctx, scratches, style) {
  ctx.save()
  ctx.lineCap = 'round'
  for (const s of scratches) {
    const n = s.points.length - 1
    for (let i = 0; i < n; i++) {
      const taper = Math.sqrt(Math.sin((Math.PI * (i + 0.5)) / n))
      ctx.strokeStyle = style(s.depth * taper)
      ctx.lineWidth = s.width * (0.5 + 0.5 * taper)
      ctx.beginPath()
      ctx.moveTo(s.points[i][0], s.points[i][1])
      ctx.lineTo(s.points[i + 1][0], s.points[i + 1][1])
      ctx.stroke()
    }
  }
  ctx.restore()
}

// Draws shapes white-on-black and reads them back as a softened 0–1 field.
function rasterise(w, h, draw, blur) {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  draw(ctx)
  const data = ctx.getImageData(0, 0, w, h).data
  const field = new Float32Array(w * h)
  for (let i = 0; i < field.length; i++) field[i] = data[i * 4] / 255
  return gaussianBlur(field, w, h, blur)
}

// Creases: flattened folds. Each is a tent-shaped height profile (the paper
// tilts either side of the fold, levelling off over creaseWidth) with a crisp
// ridge or valley on the line, running edge to edge across the sheet.
// The height is added to `surface` (relief only; it's far larger than the fine
// texture); returns a 0–1 line mask for the worn-fibre darkening and a valley
// mask for ink to pool in.
function addCreases(surface, w, h, px, S) {
  const line = new Float32Array(w * h)
  const valley = new Float32Array(w * h)
  const W = S.creaseWidth * px
  // Slope per texel that gives the requested tilt through the fibre normal map.
  const slope = S.creaseTilt / S.fibreStrength
  const soft2 = (0.8 * px) ** 2
  const lineK = 1 / (2.2 * px * px)
  const valleyK = 1 / (18 * px * px)
  const wobbleK = 1 / (140 * px)
  // Where two folds cross, the paper can't keep both creases sharp: it settles
  // into a soft pillowed patch. Each fold's tip rounds off more and more towards
  // the crossing (a bell over radius R), and its worn line fades out there.
  const R = Math.max(0, S.creaseRound) * px
  const roundK = R > 0 ? 1 / (R * R) : 0
  // One fold direction per sheet, mostly near-horizontal or near-vertical like
  // real folds, sometimes at an odd angle. Creases alternate between it and its
  // perpendicular, so they always cross at right angles.
  const baseAng =
    random() < 0.7
      ? (random() < 0.5 ? 0 : Math.PI / 2) + ((random() - 0.5) * 8 * Math.PI) / 180
      : random() * Math.PI
  // Where the folds cross: always within the middle 80% of the sheet, placed
  // from its centre in units of the shorter side (as the logo is), so it keeps
  // its spot relative to the logo when the window is resized.
  const m = S.logoBase
  const ix = S.logoX + (random() - 0.5) * 0.8 * m
  const iy = h / 2 + (random() - 0.5) * 0.8 * m
  for (let n = 0; n < S.creases; n++) {
    const ang = baseAng + (n % 2) * (Math.PI / 2)
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    // The first pair passes through the crossing point; any further creases are
    // parallel folds shifted sideways from it.
    const shift = n < 2 ? 0 : (random() < 0.5 ? -1 : 1) * (0.2 + random() * 0.15) * Math.min(w, h)
    const cx = ix - dy * shift
    const cy = iy + dx * shift
    const amp = (random() < 0.5 ? 1 : -1) * -slope * W
    const isValley = amp > 0
    const wobble = random() * 1000
    const wob = 1.5 * px
    for (let y = 0; y < h; y++) {
      const ry = y - cy
      for (let x = 0; x < w; x++) {
        const rx = x - cx
        // u: distance along the fold from where it crosses the other fold
        // (cx, cy); d: distance across it, with slight waviness so the fold
        // isn't ruler-straight.
        const u = rx * dx + ry * dy
        const d = -rx * dy + ry * dx + Math.sin(u * wobbleK + wobble) * wob
        const d2 = d * d
        const i = y * w + x
        // 1 at the crossing, fading to 0 about R away.
        const g = roundK ? Math.exp(-(u * u + d2) * roundK) : 0
        const round = 0.5 * R * g
        surface[i] += amp * (1 - Math.exp(-Math.sqrt(d2 + soft2 + round * round) / W))
        const l = Math.exp(-d2 * lineK) * (1 - 0.8 * g)
        if (l > line[i]) line[i] = l
        if (isValley) {
          const v = Math.exp(-d2 / (1 / valleyK + round * round))
          if (v > valley[i]) valley[i] = v
        }
      }
    }
  }
  return { line, valley }
}

// Writes a tangent-space normal's x,y (from a height field, by central
// differences) into channels 0 and 1 of an RGBA array, flipping rows so the
// texture's first row is the bottom of the image as WebGL expects.
function writeNormalXY(height, strength, w, h, out) {
  const k = 0.5 * strength
  for (let y = 0; y < h; y++) {
    const row = y * w
    const up = (y > 0 ? y - 1 : 0) * w
    const down = (y < h - 1 ? y + 1 : h - 1) * w
    const o = (h - 1 - y) * w * 4
    for (let x = 0; x < w; x++) {
      const nx = -(height[row + (x < w - 1 ? x + 1 : x)] - height[row + (x > 0 ? x - 1 : 0)]) * k
      const ny = (height[down + x] - height[up + x]) * k
      const inv = 127.5 / Math.sqrt(nx * nx + ny * ny + 1)
      out[o + x * 4] = nx * inv + 127.5
      out[o + x * 4 + 1] = ny * inv + 127.5
    }
  }
}

// Writes a 0–1 field (optionally remapped) into one channel, flipping rows.
function writeChannel(field, w, h, out, channel, map = (v) => v) {
  for (let y = 0; y < h; y++) {
    const row = y * w
    const o = (h - 1 - y) * w * 4 + channel
    for (let x = 0; x < w; x++) out[o + x * 4] = map(field[row + x]) * 255
  }
}

// Paper colour: a diagonal gradient from the top-left corner to the bottom-right,
// with faint fibre mottling, vellum speckle, tinted fibres and the worn crease line.
// px is texture pixels per CSS pixel, so details keep their on-screen size.
function buildColor(fibreH, w, h, px, S, fibrePaths, scratches, creaseLine) {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const img = ctx.createImageData(w, h)
  const len2 = w * w + h * h
  const [fr0, fg0, fb0] = S.paperFrom
  const [fr1, fg1, fb1] = S.paperTo
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const t = (x * w + y * h) / len2
      const shade = (1 + fibreH[i] * 0.02) * (1 - (creaseLine ? creaseLine[i] * S.creaseLine : 0))
      img.data[i * 4] = (fr0 + (fr1 - fr0) * t) * shade
      img.data[i * 4 + 1] = (fg0 + (fg1 - fg0) * t) * shade
      img.data[i * 4 + 2] = (fb0 + (fb1 - fb0) * t) * shade
      img.data[i * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  addVellumSpeckle(ctx, w, h, px, S.speckle)
  const [fr, fg, fb] = S.fibreColor
  strokeFibres(ctx, fibrePaths, (a) => `rgba(${fr}, ${fg}, ${fb}, ${a * Math.min(1, S.fibres)})`)
  // Compressed fibres in the scratch grooves read very slightly darker.
  strokeScratches(ctx, scratches, (a) => `rgba(110, 110, 115, ${a * 0.08})`)

  // Read back, flipping rows for WebGL.
  const src = ctx.getImageData(0, 0, w, h).data
  const out = new Uint8ClampedArray(w * h * 4)
  const rowBytes = w * 4
  for (let y = 0; y < h; y++) out.set(src.subarray(y * rowBytes, (y + 1) * rowBytes), (h - 1 - y) * rowBytes)
  return out
}

// Vellum-style inclusions: faint cloudy formation, fine warm-grey flecks and a
// few stray fibres, all kept subtle so the paper still reads as plain.
function addVellumSpeckle(ctx, w, h, px, speckle) {
  // Cloudy formation: a coarse random grid scaled up smoothly into soft patches.
  const cell = 70 * px
  const cw = Math.ceil(w / cell) + 1
  const ch = Math.ceil(h / cell) + 1
  const cloud = makeCanvas(cw, ch)
  const cctx = cloud.getContext('2d', { willReadFrequently: true })
  const cimg = cctx.createImageData(cw, ch)
  for (let i = 0; i < cw * ch; i++) {
    cimg.data[i * 4] = 120
    cimg.data[i * 4 + 1] = 116
    cimg.data[i * 4 + 2] = 108
    cimg.data[i * 4 + 3] = random() * 255
  }
  cctx.putImageData(cimg, 0, 0)
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.globalAlpha = speckle * 0.07
  ctx.drawImage(cloud, 0, 0, cw * cell, ch * cell)
  ctx.restore()

  // Flecks: mostly tiny, occasionally a slightly larger one.
  const tone = () => {
    const g = 70 + random() * 60
    return `${g + 10}, ${g + 4}, ${g - 6}`
  }
  const flecks = Math.round(((w * h) / (px * px)) * 0.0011)
  for (let i = 0; i < flecks; i++) {
    const big = random() < 0.06
    const r = (big ? 1.1 + random() * 0.8 : 0.35 + random() * 0.6) * px
    const a = speckle * (big ? 0.18 + random() * 0.2 : 0.2 + random() * 0.35)
    ctx.fillStyle = `rgba(${tone()}, ${a})`
    ctx.beginPath()
    ctx.arc(random() * w, random() * h, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Stray fibres: short, thin, slightly curved hairs.
  ctx.lineCap = 'round'
  const hairs = Math.round(((w * h) / (px * px)) * 0.00004)
  for (let i = 0; i < hairs; i++) {
    const x = random() * w
    const y = random() * h
    const ang = random() * Math.PI * 2
    const len = (4 + random() * 9) * px
    const bend = (random() - 0.5) * len * 0.8
    ctx.strokeStyle = `rgba(${tone()}, ${speckle * (0.15 + random() * 0.2)})`
    ctx.lineWidth = (0.4 + random() * 0.4) * px
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend,
      y + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend,
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len,
    )
    ctx.stroke()
  }
}

// img: the logo (ImageBitmap, image or canvas). w, h: texture size. px: texture
// pixels per CSS pixel. S: settings from paperScene.js.
// S.logoX: where the logo's centre goes across the sheet (texels), and
// S.logoBase: the length (texels) the logo is sized from (the screen's shorter
// side). The sheet can be wider than the screen (extra paper to the left, for
// panning), so these default to the middle and the shorter side.
export function generatePaperTextures(img, w, h, px, settings) {
  const S = { logoX: w / 2, logoBase: Math.min(w, h), ...settings }
  const stream = (k) => {
    if (S.seed === undefined) random = Math.random
    else seedRandom(S.seed + k * 0x9e3779b9)
  }
  const logo = buildLogoHeight(img, w, h, S)

  stream(1)
  const fibre = buildFibreHeight(w, h)
  stream(2)
  if (S.pulp > 0) addPulp(fibre, w, h, px, S.pulp * 0.35)
  stream(3)
  const fibrePaths = S.fibres > 0 ? makeFibrePaths(w, h, px, S) : []
  if (fibrePaths.length) {
    const strands = rasterise(w, h, (ctx) => strokeFibres(ctx, fibrePaths, (a) => `rgba(255,255,255,${a})`), 0.8 * px)
    for (let i = 0; i < fibre.length; i++) fibre[i] += strands[i] * S.fibreRelief
  }

  const surface = new Uint8ClampedArray(w * h * 4)
  // Fibre-only texture for ink wicking, taken before scratches and creases.
  writeChannel(fibre, w, h, surface, 2, (v) => 0.5 + v * 0.2)

  const groove = new Float32Array(w * h)
  stream(4)
  const scratches = S.scratches > 0 ? makeScratches(w, h, px, S) : []
  if (scratches.length) {
    const grooves = rasterise(w, h, (ctx) => strokeScratches(ctx, scratches, (a) => `rgba(255,255,255,${a})`), 0.6 * px)
    for (let i = 0; i < fibre.length; i++) {
      fibre[i] -= grooves[i] * S.scratchDepth
      groove[i] = Math.min(1, grooves[i] * 1.5)
    }
  }

  // Creases go into the surface relief only; their broad slopes would swamp the
  // fibre-based colour mottling, so the colour map reads `fibre` without them.
  const relief = fibre.slice()
  stream(5)
  const creases = S.creases > 0 ? addCreases(relief, w, h, px, S) : null
  if (creases) for (let i = 0; i < groove.length; i++) if (creases.valley[i] > groove[i]) groove[i] = creases.valley[i]
  writeNormalXY(relief, S.fibreStrength, w, h, surface)
  writeChannel(groove, w, h, surface, 3)

  stream(6)
  const color = buildColor(fibre, w, h, px, S, fibrePaths, scratches, creases?.line)

  // Logo: normal, height, and a soft mask of where its cast shadows can reach
  // so the shader can skip the shadow search elsewhere. The logo's height
  // changes by less per texel the more texels it covers (k), so the strength is
  // scaled by k to give the same slopes, and so the same look, at any texture
  // size: on a phone and on a big screen alike. It's matched to how it looked
  // on a desktop screen (k = LOGO_REF_K) when LOGO_STRENGTH was tuned.
  const logoOut = new Uint8ClampedArray(w * h * 4)
  writeNormalXY(logo.height, (S.logoStrength * logo.k) / LOGO_REF_K ** 2, w, h, logoOut)
  writeChannel(logo.height, w, h, logoOut, 2)
  // Shadow length is a fraction of the sheet's shorter side, as the logo is.
  const reach = (S.shadowLength * S.logoBase) / 2
  const shadowMask = gaussianBlur(logo.height, w, h, Math.max(1, reach * 0.6))
  writeChannel(shadowMask, w, h, logoOut, 3, (v) => Math.min(1, v * 60))

  return { color, surface, logo: logoOut }
}
