import * as THREE from 'three'

// Calligraphic ink the user paints by dragging: a broad nib held at a fixed
// angle (thick one way, hairline the other), a black halftone core with a hint
// of green, a greener rim, and slightly ragged edges. The line is fat and wet
// when the pen moves slowly and thins as it speeds up. Ink pools darker where
// the pen moves slowly, blots where it touches down, lifts off or rests,
// splatters forward when a fast stroke stops dead, and sometimes flicks
// droplets. Once down, ink slowly bleeds outward into the paper as a pale halo.
// Each stroke lasts INK_LIFESPAN seconds from when the pen touched down, then
// fades out as a whole (not as a trail).
//
// Drawn into a canvas that the paper shader blends into the paper colour, so the
// ink takes the scene's lighting. A half-resolution "age" canvas records which
// moment each spot's stroke began, for the fade. After the first upload only
// the region that changed is sent to the GPU, and the shader is told where ink
// exists at all so it can skip the rest of the page.

// The pens you can draw with. Each has its own nib, colours and behaviour;
// see PEN_STYLES below for what every setting does. The user's pen is chosen
// in the dev menu, and every stroke (including other people's, live) is drawn
// with the pen it was made with.
export const PENS = ['calligraphy', 'pencil', 'biro blue', 'biro red']
export const DEFAULT_PEN = 'calligraphy'

// nib: its length (CSS px); angle: how it's held (degrees; negative tilts it
// up to the right); widthSlow/widthFast: the line's width as a fraction of the
// nib when moving slowly and when fast, reaching its thinnest at fastAt (CSS
// px/s). core/dot/edge: the ink's colour, the grain printed over it, and its
// edge (also the streaks along a stroke). grain: the size of that grain (CSS
// px) and how strong it is; speckle draws it as scattered dots (pencil on
// paper) rather than a halftone. alpha: how opaque the ink is. edgeWidth and
// streaks scale the darker edge and the streaks along a stroke (0 = none).
// hollow: how much a ballpoint starves down the middle of its line, leaving
// the paper showing in patches (0 = never).
// poolColor/pooling: the deeper colour ink gathers into, and how readily.
// blotTouch/blotLift/blotRest: how big blots get (fraction of the nib) where
// the pen touches down, lifts off, or rests for restTime seconds;
// flickChance: the chance of flicking droplets off a fast stroke. splat*: a
// fast stroke stopping dead throws ink (speed thresholds in CSS px/s; amount
// 0 = never). bleed*: how far and how strongly the ink creeps into the paper.
const PEN_STYLES = {
  calligraphy: {
    nib: 15,
    angle: 0,
    widthSlow: 1.35,
    widthFast: 0.18,
    fastAt: 900,
    core: '#161d19',
    dot: '#2c3b31',
    edge: '#1c3526',
    grainSize: 4,
    grainStrength: 0.25,
    speckle: false,
    alpha: 1,
    edgeWidth: 1,
    streaks: 1,
    hollow: 0,
    poolColor: '#060a07',
    pooling: 1,
    blotTouch: 0.35,
    blotLift: 0.3,
    blotRest: 0.9,
    restTime: 1.5,
    flickChance: 0.5,
    splatSpeed: 900,
    splatStop: 60,
    splatAmount: 1,
    bleed: 0.3,
    bleedSpread: 0.1,
    bleedColor: '#7d9486',
    bleedLayerAlpha: 0.035,
  },
  // Graphite: a small round tip, grainy and grey, that hardly blots or bleeds
  // and goes darker (not thicker) when pressed slowly along.
  pencil: {
    nib: 5.5,
    angle: -38,
    // The same width however fast it moves.
    widthSlow: 1,
    widthFast: 1,
    fastAt: 1200,
    core: '#4a4a4c',
    dot: '#87878c',
    edge: '#5f6064',
    grainSize: 3,
    grainStrength: 0.85,
    speckle: true,
    alpha: 0.72,
    edgeWidth: 0.5,
    streaks: 1.4,
    hollow: 0,
    poolColor: '#3a3a3d',
    pooling: 0.35,
    blotTouch: 0.12,
    blotLift: 0.1,
    blotRest: 0.22,
    restTime: 2.5,
    flickChance: 0,
    splatSpeed: 1200,
    splatStop: 40,
    splatAmount: 0,
    bleed: 0.05,
    bleedSpread: 0.04,
    bleedColor: '#9b9b9f',
    bleedLayerAlpha: 0.02,
  },
  // Ballpoint: an even, narrow line that pools where it slows and skips into
  // little blobs, with barely any spread into the paper.
  'biro blue': {
    nib: 4.6,
    angle: 0,
    widthSlow: 1,
    widthFast: 0.7,
    fastAt: 1400,
    core: '#23379b',
    dot: '#4055c4',
    edge: '#182a7d',
    grainSize: 3,
    grainStrength: 0.12,
    speckle: false,
    alpha: 0.95,
    edgeWidth: 0.6,
    streaks: 0.5,
    hollow: 0.75,
    poolColor: '#101d63',
    pooling: 1.6,
    blotTouch: 0.3,
    blotLift: 0.28,
    blotRest: 0.75,
    restTime: 1.8,
    flickChance: 0.15,
    splatSpeed: 1100,
    splatStop: 50,
    splatAmount: 0.25,
    bleed: 0.08,
    bleedSpread: 0.05,
    bleedColor: '#8e9ad6',
    bleedLayerAlpha: 0.025,
  },
  'biro red': {
    nib: 4.6,
    angle: 0,
    widthSlow: 1,
    widthFast: 0.7,
    fastAt: 1400,
    core: '#b3242a',
    dot: '#cf4a4a',
    edge: '#8e181f',
    grainSize: 3,
    grainStrength: 0.12,
    speckle: false,
    alpha: 0.95,
    edgeWidth: 0.6,
    streaks: 0.5,
    hollow: 0.75,
    poolColor: '#6d0f14',
    pooling: 1.6,
    blotTouch: 0.3,
    blotLift: 0.28,
    blotRest: 0.75,
    restTime: 1.8,
    flickChance: 0.15,
    splatSpeed: 1100,
    splatStop: 50,
    splatAmount: 0.25,
    bleed: 0.08,
    bleedSpread: 0.05,
    bleedColor: '#e0919a',
    bleedLayerAlpha: 0.025,
  },
}

// Lifespan: seconds each stroke stays at full strength from when it's drawn (0
// = forever), then how many seconds it takes to fade away.
export const INK_LIFESPAN = 120
export const INK_FADE = 3
// Bleeding: after ink lands it slowly spreads into the paper as a pale,
// diluted halo (how far and how strongly is the pen's; see PEN_STYLES). It
// creeps over BLEED_TIME seconds, fast at first then slowing, in faint layers
// laid every BLEED_STEP seconds, each part of a stroke on its own schedule.
const BLEED_TIME = 4
const BLEED_STEP = 0.1

// The stroke is remembered for bleeding in groups of this many seconds'
// drawing, each spreading on its own schedule.
const BLEED_GROUP = 0.15
// A stroke drawn before this page opened (someone else's, replayed from the
// last few minutes) has already bled: rather than laying a layer every
// BLEED_STEP from nothing, its halo is caught up in this many layers at once.
const BLEED_CATCHUP = 5
// How far (CSS px) around the ink its stroke direction is recorded: past the
// soft edge the shader gives ink, so every inked pixel on screen has one.
const DIR_REACH = 6

// Ink ages are stored as 0–255 time steps that only count up (so where two
// ages blend at an edge, the result is still a time between them). When the
// count nears 255 everything is shifted down (see `rebase`); the 120 steps kept
// cover lifespan + fade with room to spare. Every spot of a stroke gets the
// step it began in, so the whole stroke fades at once.
const AGE_STEP = Math.max(0.02, (INK_LIFESPAN + INK_FADE + 4) / 120)

export function createInk() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  // Finished ink. Read back often (for uploads), so kept in CPU memory.
  const baseCtx = canvas.getContext('2d', { willReadFrequently: true })
  // Where drawing goes: a pen's own layer while it draws (see `select`), the
  // finished ink otherwise.
  let ctx = baseCtx
  // Strokes being drawn go on their pen's own layer, above the finished ink,
  // so a new stroke paints over old ink it crosses while its red edge still
  // tucks behind its own core. The layer merges into the finished ink when the
  // pen lifts. Uploads blend any layers over the finished ink, a strip at a
  // time (see `flush`).
  const newLayer = () => {
    const c = document.createElement('canvas')
    c.width = canvas.width
    c.height = canvas.height
    return c.getContext('2d', { willReadFrequently: true })
  }
  // Uploaded straight from the canvas (flipped by WebGL), so no readback is
  // needed; later patches are flipped the same way.
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  // Which way the pen was travelling where it laid ink, at half resolution, so
  // the paper shader can tell which side of a raised logo line the nib is
  // leaving (where it hops off and lands a little later) from the side it's
  // coming up against, or running along. Stored as the unit direction (x, y,
  // canvas axes) in red and green, 0.5 = 0; alpha marks spots with a direction.
  const dirCanvas = document.createElement('canvas')
  dirCanvas.width = dirCanvas.height = 1
  const dirCtx = dirCanvas.getContext('2d', { willReadFrequently: true })
  const dirTexture = new THREE.CanvasTexture(dirCanvas)
  dirTexture.minFilter = dirTexture.magFilter = THREE.LinearFilter
  dirTexture.generateMipmaps = false

  // When each spot's stroke began (red channel = time step; alpha = has an
  // age), at half resolution. Sampled smoothly: ages only count up, so a blend
  // of two is a time between them.
  const ageCanvas = document.createElement('canvas')
  ageCanvas.width = ageCanvas.height = 1
  const ageCtx = ageCanvas.getContext('2d', { willReadFrequently: true })
  const ageTexture = new THREE.CanvasTexture(ageCanvas)
  ageTexture.minFilter = ageTexture.magFilter = THREE.LinearFilter
  ageTexture.generateMipmaps = false
  // Scratch canvas the size of the age canvas, for masking halo ages.
  const maskCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })

  // For the paper shader: the fade (ages), the stroke directions, and how
  // strongly the ink shows overall (kept at 1; the haze reads it too).
  const uniforms = {
    inkOpacity: { value: 1 },
    inkDirMap: { value: dirTexture },
    inkAgeMap: { value: ageTexture },
    inkNowStep: { value: 0 },
    inkAgeStep: { value: AGE_STEP },
    inkLifespan: { value: INK_LIFESPAN > 0 ? INK_LIFESPAN : 1e9 },
    inkFade: { value: Math.max(0.01, INK_FADE) },
  }
  // Scene time in seconds (pauses with the page), plus a head start of a whole
  // lifespan, so a stroke that arrives already old (someone else's, drawn
  // before this page opened) still has a time to record.
  const HEADROOM = INK_LIFESPAN + INK_FADE + 10
  let now = HEADROOM
  // Steps subtracted so far by `rebase`.
  let ageBase = 0
  const ageStepAt = (t) => Math.floor(t / AGE_STEP) - ageBase
  // Shifts every stored age down by `shift` steps (ages older than that are
  // long expired and become 0), so the count never has to wrap around.
  const rebase = (shift) => {
    ageBase += shift
    if (ageCanvas.width > 1) {
      const img = ageCtx.getImageData(0, 0, ageCanvas.width, ageCanvas.height)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) d[i] = Math.max(0, d[i] - shift)
      ageCtx.putImageData(img, 0, 0)
      ageTexture.needsUpdate = true
    }
    for (const r of new Set([...records, ...wet, ...drawing()])) r.born = Math.max(0, r.born - shift)
  }
  // How far (canvas px) the shader's soft ink edge reaches; ages are drawn at
  // least this far around ink so every pixel of it on screen has one.
  let ageReach = 0

  let px = 1
  // The pen's size relative to the sizes in PEN_STYLES (see setPenScale).
  let penScale = 1
  // Where the logo sits on the canvas (see resize).
  let logoAnchor = null
  // The pen being drawn with (see select and setPenStyle), and each pen's
  // grain, as a tile and as a fill for the canvas it's painted on.
  let pen = PEN_STYLES[DEFAULT_PEN]
  let penName = DEFAULT_PEN
  const patternTiles = new Map()
  let patterns = new Map()
  const corePattern = () => {
    let byCtx = patterns.get(penName)
    if (!byCtx) patterns.set(penName, (byCtx = new WeakMap()))
    let p = byCtx.get(ctx)
    if (!p) byCtx.set(ctx, (p = ctx.createPattern(patternTiles.get(penName), 'repeat')))
    return p
  }
  // Changes are tracked in TILE-pixel tiles, so only the parts actually painted
  // (not the box around everything) are sent to the GPU.
  const TILE = 128
  let cols = 1
  const dirtyTiles = new Set()
  // Everywhere live ink is, as UV bounds (u0, v0, u1, v1), for the shader.
  const bounds = new THREE.Vector4(2, 2, -1, -1)
  // Strokes waiting to expire, each with its canvas bounds, the tiles it
  // touched and the age step it began in; the stroke being drawn; and tiles
  // queued for clearing once their ink has faded (a few per frame, to avoid a
  // stall).
  const records = []
  let current = null
  const clearQueue = new Set()
  // Strokes whose ink is still bleeding (their `groups` hold the nib stamps laid
  // down, grouped by when, so each part spreads according to its own age).
  const wet = []

  const markUpload = (x0, y0, x1, y1, rec = null) => {
    const tx0 = Math.max(0, Math.floor(x0 / TILE))
    const ty0 = Math.max(0, Math.floor(y0 / TILE))
    const tx1 = Math.min(cols - 1, Math.floor(x1 / TILE))
    const ty1 = Math.min(Math.ceil(canvas.height / TILE) - 1, Math.floor(y1 / TILE))
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const k = ty * cols + tx
        dirtyTiles.add(k)
        rec?.tiles.add(k)
      }
    }
  }
  const addBounds = (x0, y0, x1, y1) => {
    // Canvas y runs down; UV v runs up.
    bounds.x = Math.min(bounds.x, x0 / canvas.width)
    bounds.y = Math.min(bounds.y, 1 - y1 / canvas.height)
    bounds.z = Math.max(bounds.z, x1 / canvas.width)
    bounds.w = Math.max(bounds.w, 1 - y0 / canvas.height)
  }
  const markDirty = (x0, y0, x1, y1) => {
    markUpload(x0, y0, x1, y1, current)
    addBounds(x0, y0, x1, y1)
    if (current) {
      current.x0 = Math.min(current.x0, x0)
      current.y0 = Math.min(current.y0, y0)
      current.x1 = Math.max(current.x1, x1)
      current.y1 = Math.max(current.y1, y1)
    }
  }
  const recomputeBounds = () => {
    bounds.set(2, 2, -1, -1)
    for (const r of [...records, ...drawing()]) addBounds(r.x0, r.y0, r.x1, r.y1)
  }

  // Each pen's grain: a halftone dot, or scattered specks for a pencil.
  const makePattern = () => {
    patternTiles.clear()
    patterns = new Map()
    for (const [name, style] of Object.entries(PEN_STYLES)) {
      const cell = Math.max(2, Math.round(style.grainSize * px))
      const tile = document.createElement('canvas')
      tile.width = tile.height = cell
      // In CPU memory like the ink canvases it fills: a GPU canvas here would
      // be read back from the GPU every frame, stalling it until the frame is
      // done.
      const t = tile.getContext('2d', { willReadFrequently: true })
      t.fillStyle = style.core
      t.fillRect(0, 0, cell, cell)
      t.fillStyle = style.dot
      if (style.speckle) {
        // Paper grain: specks left unmarked, so the stroke looks rubbed on.
        for (let i = 0; i < cell * cell * 0.5; i++) {
          t.globalAlpha = style.grainStrength * (0.3 + Math.random() * 0.7)
          t.fillRect(Math.floor(Math.random() * cell), Math.floor(Math.random() * cell), 1, 1)
        }
      } else {
        t.globalAlpha = style.grainStrength
        t.beginPath()
        t.arc(cell / 2, cell / 2, cell * 0.24, 0, Math.PI * 2)
        t.fill()
      }
      patternTiles.set(name, tile)
    }
  }

  // A pen's stroke state, in canvas pixels. `streaks` are fixed positions
  // across the nib (-1..1) where a darker red line runs along the stroke, like
  // the uneven ink in brush calligraphy. `peak` is the recent top speed (decays
  // over ~150 ms) that a sudden stop splatters from.
  const makeStroke = () => ({
    active: false,
    x: 0,
    y: 0,
    sx: 0,
    sy: 0,
    t: 0,
    width: 1,
    speed: 0,
    peak: 0,
    peakT: 0,
    splatted: true,
    dirX: 1,
    dirY: 0,
    // How far the pen has travelled (canvas px) and where its skipping starts,
    // for a ballpoint's starved middle (see `hollow`).
    dist: 0,
    hollowPhase: 0,
    streaks: [],
    rest: 0,
    // Recent pointer positions (with the line width at each) that the stroke's
    // curve passes through, and whether the curve has already been drawn up to
    // the newest one (done early when the pen pauses).
    pts: [],
    tailDrawn: true,
  })
  // Several pens can draw at once (the user, and the intro replay). Each has
  // its own stroke state and its own record of the stroke being drawn; the
  // drawing code below works on whichever pen is selected.
  const pens = new Map()
  let stroke = makeStroke()
  let penState = null
  const select = (id) => {
    penState = pens.get(id)
    if (!penState) pens.set(id, (penState = { stroke: makeStroke(), current: null, layer: null, pen: DEFAULT_PEN }))
    if (!penState.layer) penState.layer = newLayer()
    stroke = penState.stroke
    current = penState.current
    ctx = penState.layer
    penName = PEN_STYLES[penState.pen] ? penState.pen : DEFAULT_PEN
    pen = PEN_STYLES[penName]
  }
  // Records of strokes being drawn by any pen.
  const drawing = () => [...pens.values()].map((p) => p.current).filter(Boolean)

  const quadPath = (c, x0, y0, x1, y1, nx, ny, k) => {
    c.beginPath()
    c.moveTo(x0 - nx * k, y0 - ny * k)
    c.lineTo(x0 + nx * k, y0 + ny * k)
    c.lineTo(x1 + nx * k, y1 + ny * k)
    c.lineTo(x1 - nx * k, y1 - ny * k)
    c.closePath()
  }
  const blotPath = (c, x, y, r, k, phases) => {
    c.beginPath()
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2
      const rr =
        r * k * (1 + 0.12 * Math.sin(3 * a + phases[0]) + 0.07 * Math.sin(5 * a + phases[1]) + 0.05 * Math.sin(8 * a + phases[2]))
      if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    c.closePath()
  }
  // Records the pen's direction of travel (dx, dy) over a shape: the ink itself
  // takes this stroke's direction; the band around it (for the soft edge) only
  // where no stroke has claimed it yet. width: extra stroke width (canvas px)
  // around the shape; fill: false for a line (just stroked).
  const stampDir = (path, dx, dy, width = 0, fill = true) => {
    const len = Math.hypot(dx, dy)
    if (len < 1e-3) {
      dx = stroke.dirX
      dy = stroke.dirY
    } else {
      dx /= len
      dy /= len
    }
    const r = Math.round((dx * 0.5 + 0.5) * 255)
    const g = Math.round((dy * 0.5 + 0.5) * 255)
    dirCtx.fillStyle = dirCtx.strokeStyle = `rgb(${r},${g},0)`
    dirCtx.lineJoin = dirCtx.lineCap = 'round'
    dirCtx.globalCompositeOperation = 'destination-over'
    dirCtx.lineWidth = width + 2 * DIR_REACH * px
    path(dirCtx)
    if (fill) dirCtx.fill()
    dirCtx.stroke()
    dirCtx.globalCompositeOperation = 'source-over'
    dirCtx.lineWidth = width + 2 * px
    path(dirCtx)
    if (fill) dirCtx.fill()
    dirCtx.stroke()
  }

  // Records the stroke's age over a shape (drawn a little wider than the ink,
  // so the whole of it, edges included, gets an age). width: stroke width
  // (canvas px) around the shape; fill: false for a line (just stroked).
  const stampAge = (path, width, fill = true) => {
    const style = `rgb(${current ? current.born : ageStepAt(now)},0,0)`
    ageCtx.fillStyle = style
    ageCtx.strokeStyle = style
    ageCtx.lineJoin = 'round'
    ageCtx.lineCap = 'round'
    // The band around the ink (for its soft edge) only claims spots with no
    // age yet, so older ink nearby keeps its own age and isn't revived.
    ageCtx.globalCompositeOperation = 'destination-over'
    ageCtx.lineWidth = width + 4 + ageReach * 2
    path(ageCtx)
    if (fill) ageCtx.fill()
    ageCtx.stroke()
    // The ink itself is newest: it's painted over whatever was under it, but
    // no wider than the ink goes — a margin here would make older ink beside
    // this stroke read as new, so it would outlive its own stroke and be left
    // behind as a rind along this one.
    ageCtx.globalCompositeOperation = 'source-over'
    ageCtx.lineWidth = width
    path(ageCtx)
    if (fill) ageCtx.fill()
    ageCtx.stroke()
  }

  // Keeps where the stroke went so it can bleed later, grouped by when it was
  // drawn: the nib's path as a polyline (NaN separates breaks), its typical
  // half-thickness, and blots as [x, y, r].
  const groupFor = () => {
    const bucket = Math.floor(now / BLEED_GROUP)
    let g = current.groups[current.groups.length - 1]
    if (!g || g.bucket !== bucket) {
      g = { bucket, t: now, catchUp: current.aged, line: [], blots: [], half: 0, n: 0, next: now + BLEED_STEP, wobble: 0.9 + Math.random() * 0.2, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
      current.groups.push(g)
    }
    return g
  }
  const growGroup = (g, x0, y0, x1, y1) => {
    g.x0 = Math.min(g.x0, x0)
    g.y0 = Math.min(g.y0, y0)
    g.x1 = Math.max(g.x1, x1)
    g.y1 = Math.max(g.y1, y1)
  }
  const rememberStep = (x0, y0, x1, y1, half, bx0, by0, bx1, by1) => {
    if (!current || pen.bleed <= 0) return
    const g = groupFor()
    const line = g.line
    const n = line.length
    if (!n || Math.abs(line[n - 2] - x0) + Math.abs(line[n - 1] - y0) > 0.5) {
      if (n) line.push(NaN, NaN)
      line.push(x0, y0)
    }
    line.push(x1, y1)
    g.half += (half - g.half) / ++g.n
    growGroup(g, bx0, by0, bx1, by1)
  }
  const rememberBlot = (x, y, r, bx0, by0, bx1, by1) => {
    if (!current || pen.bleed <= 0) return
    const g = groupFor()
    g.blots.push(x, y, r)
    growGroup(g, bx0, by0, bx1, by1)
  }
  // Traces a group's path, widened by `grow`: the polyline (to be stroked) and
  // the blots (to be filled).
  const traceLine = (c, g) => {
    c.beginPath()
    const l = g.line
    let pen = false
    for (let i = 0; i < l.length; i += 2) {
      if (Number.isNaN(l[i])) pen = false
      else if (pen) c.lineTo(l[i], l[i + 1])
      else {
        c.moveTo(l[i], l[i + 1])
        pen = true
      }
    }
  }
  const traceBlots = (c, g, grow) => {
    c.beginPath()
    const b = g.blots
    for (let i = 0; i < b.length; i += 3) {
      c.moveTo(b[i] + b[i + 2] + grow, b[i + 1])
      c.arc(b[i], b[i + 1], b[i + 2] + grow, 0, Math.PI * 2)
    }
  }

  // One step of the nib from (x0, y0) to (x1, y1): the nib sweeps a
  // parallelogram. Core goes on top; the red edge is tucked behind existing ink
  // ('destination-over') so it never paints over the core of the same stroke.
  const stamp = (x0, y0, x1, y1, width) => {
    const ang = ((pen.angle + (Math.random() - 0.5) * 6) * Math.PI) / 180
    const half = (nibOf() / 2) * width * (1 + (Math.random() - 0.5) * 0.16)
    const nx = Math.cos(ang) * half
    const ny = Math.sin(ang) * half
    const quad = (k) => quadPath(ctx, x0, y0, x1, y1, nx, ny, k)
    // Hairline so strokes along the nib direction don't vanish.
    const hair = (c = ctx) => {
      c.beginPath()
      c.moveTo(x0, y0)
      c.lineTo(x1, y1)
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = pen.alpha
    ctx.fillStyle = corePattern()
    ctx.strokeStyle = corePattern()
    quad(0.72)
    ctx.fill()
    ctx.lineWidth = 1.1 * px
    hair()
    ctx.stroke()
    ctx.globalAlpha = 1

    // Slow strokes pool: a little deeper colour builds up with each overlapping step.
    const slow = Math.max(0, 1 - stroke.speed / 500)
    if (pen.pooling > 0 && slow > 0) {
      ctx.globalAlpha = 0.045 * slow * pen.pooling
      ctx.fillStyle = pen.poolColor
      quad(0.6)
      ctx.fill()
    }

    // Streaks along the stroke at fixed offsets across the nib.
    ctx.strokeStyle = pen.edge
    ctx.lineCap = 'round'
    for (const [k, alpha] of stroke.streaks) {
      ctx.globalAlpha = Math.min(1, alpha * pen.streaks)
      ctx.lineWidth = 0.9 * px
      ctx.beginPath()
      ctx.moveTo(x0 + nx * k * 0.72, y0 + ny * k * 0.72)
      ctx.lineTo(x1 + nx * k * 0.72, y1 + ny * k * 0.72)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    ctx.globalCompositeOperation = 'destination-over'
    ctx.globalAlpha = pen.edgeWidth > 0 ? pen.alpha : 0
    ctx.fillStyle = pen.edge
    ctx.strokeStyle = pen.edge
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2 * px * pen.edgeWidth
    quad(1)
    ctx.fill()
    ctx.stroke()
    ctx.lineWidth = 2.6 * px * pen.edgeWidth
    hair()
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    // A ballpoint starves: the ball leaves the middle of its track bare in
    // patches, more so as it speeds up. Erased (not painted over) so the paper
    // shows, after the edge, which would otherwise fill it back in.
    const travelled = Math.hypot(x1 - x0, y1 - y0)
    stroke.dist += travelled
    if (pen.hollow > 0) {
      const d = stroke.dist / px
      // Two slow waves, so the gaps come in runs rather than flickering.
      const wave = Math.sin(d / 23 + stroke.hollowPhase) + 0.7 * Math.sin(d / 7.3 + stroke.hollowPhase * 2.3)
      const gap = Math.max(0, wave - 0.35) / 1.35
      if (gap > 0) {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.globalAlpha = Math.min(0.92, pen.hollow * gap * (0.55 + 0.45 * Math.min(1, stroke.speed / 700)))
        ctx.lineCap = 'round'
        ctx.lineWidth = Math.max(0.6 * px, half * 0.5)
        ctx.beginPath()
        ctx.moveTo(x0 - ny * 0.12, y0 + nx * 0.12)
        ctx.lineTo(x1 - ny * 0.12, y1 + nx * 0.12)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }
    }

    // (Its age and direction are recorded once per stretch of the stroke; see
    // drawCurve.)
    const pad = Math.abs(nx) + Math.abs(ny) + (4 + DIR_REACH) * px + ageReach
    const bx0 = Math.min(x0, x1) - pad
    const by0 = Math.min(y0, y1) - pad
    const bx1 = Math.max(x0, x1) + pad
    const by1 = Math.max(y0, y1) + pad
    markDirty(bx0, by0, bx1, by1)
    rememberStep(x0, y0, x1, y1, half, bx0, by0, bx1, by1)
    return half
  }

  // An ink blot: a wobbly pool with a deeper-coloured middle and the red edge.
  // `deepen` is how much pooled colour to add (repeat blots build it up).
  const blot = (x, y, r, deepen = 0.25) => {
    const phases = [Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3]
    const shape = (k) => blotPath(ctx, x, y, r, k, phases)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = pen.alpha
    ctx.fillStyle = corePattern()
    shape(1)
    ctx.fill()
    ctx.globalAlpha = 1
    if (pen.pooling > 0) {
      ctx.globalAlpha = deepen * pen.pooling
      ctx.fillStyle = pen.poolColor
      shape(0.8)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.globalCompositeOperation = 'destination-over'
    ctx.globalAlpha = pen.edgeWidth > 0 ? pen.alpha : 0
    ctx.fillStyle = pen.edge
    shape(1)
    ctx.lineWidth = 2.4 * px * pen.edgeWidth
    ctx.strokeStyle = pen.edge
    ctx.stroke()
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    stampAge((c) => blotPath(c, x, y, r, 1, phases), 2.4 * px)
    const pad = r * 1.3 + 4 * px + ageReach
    markDirty(x - pad, y - pad, x + pad, y + pad)
    rememberBlot(x, y, r, x - pad, y - pad, x + pad, y + pad)
  }

  // The nib's length in canvas px, for the pen in hand or another style.
  const nibOf = (style = pen) => style.nib * penScale * px
  const nib = () => nibOf()
  // The speed (CSS px/s) a pen thins out at, scaled with it: on a smaller
  // sheet the same gesture covers fewer px a second, so the line would
  // otherwise never thin. (Splattering isn't scaled: how hard the hand
  // actually flicks is what throws ink, whatever the sheet's size.)
  const fastAt = () => pen.fastAt * penScale

  // One layer of a group's halo: its path widened by how far the ink has crept
  // by `age`, laid faintly behind the ink already there. `period` is how long
  // the layer stands in for, which sets how dark it is.
  const bleedLayer = (rec, ink, g, age, period) => {
    const spread = ink.bleedSpread * ink.bleed * nibOf(ink) * (1 - Math.exp((-3 * age) / BLEED_TIME))
    if (spread < 0.3 * px) return
    const grow = spread * g.wobble

    ctx.globalCompositeOperation = 'destination-over'
    ctx.globalAlpha = 1 - (1 - ink.bleedLayerAlpha) ** (period / 0.2)
    ctx.fillStyle = ctx.strokeStyle = ink.bleedColor
    ctx.lineJoin = ctx.lineCap = 'round'
    ctx.lineWidth = 2 * (g.half + grow)
    traceLine(ctx, g)
    ctx.stroke()
    if (g.blots.length) {
      traceBlots(ctx, g, grow)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    // The halo takes its stroke's age, so it fades out with it: around it
    // only where nothing has an age yet, and where the halo itself spreads
    // onto bare paper even over the margin an older stroke nearby claimed;
    // under older ink (masked out using the finished ink) ages are left alone.
    const ageStyle = `rgb(${rec.born},0,0)`
    ageCtx.globalCompositeOperation = 'destination-over'
    ageCtx.fillStyle = ageCtx.strokeStyle = ageStyle
    ageCtx.lineJoin = ageCtx.lineCap = 'round'
    ageCtx.lineWidth = 2 * (g.half + grow + ageReach) + 4
    traceLine(ageCtx, g)
    ageCtx.stroke()
    if (g.blots.length) {
      traceBlots(ageCtx, g, grow + ageReach + 2)
      ageCtx.fill()
    }
    ageCtx.globalCompositeOperation = 'source-over'
    const hp = g.half + grow + 4 * px
    const rx = Math.max(0, Math.floor(g.x0 - hp))
    const ry = Math.max(0, Math.floor(g.y0 - hp))
    const rw = Math.min(canvas.width, Math.ceil(g.x1 + hp)) - rx
    const rh = Math.min(canvas.height, Math.ceil(g.y1 + hp)) - ry
    if (rw > 0 && rh > 0) {
      maskCtx.clearRect(rx, ry, rw, rh)
      maskCtx.globalCompositeOperation = 'source-over'
      maskCtx.fillStyle = maskCtx.strokeStyle = ageStyle
      maskCtx.lineJoin = maskCtx.lineCap = 'round'
      maskCtx.lineWidth = 2 * (g.half + grow)
      traceLine(maskCtx, g)
      maskCtx.stroke()
      if (g.blots.length) {
        traceBlots(maskCtx, g, grow)
        maskCtx.fill()
      }
      maskCtx.globalCompositeOperation = 'destination-out'
      maskCtx.drawImage(canvas, rx, ry, rw, rh, rx, ry, rw, rh)
      maskCtx.globalCompositeOperation = 'source-over'
      ageCtx.drawImage(maskCtx.canvas, rx / 2, ry / 2, rw / 2, rh / 2, rx, ry, rw, rh)
    }

    const pad = g.half + grow + ageReach + 2
    const bx0 = g.x0 - pad
    const by0 = g.y0 - pad
    const bx1 = g.x1 + pad
    const by1 = g.y1 + pad
    markUpload(bx0, by0, bx1, by1, rec)
    addBounds(bx0, by0, bx1, by1)
    rec.x0 = Math.min(rec.x0, bx0)
    rec.y0 = Math.min(rec.y0, by0)
    rec.x1 = Math.max(rec.x1, bx1)
    rec.y1 = Math.max(rec.y1, by1)
  }

  // Spreads still-wet ink a little further into the paper: each group of the
  // stroke is redrawn widened by how far its ink has crept by now, as a faint
  // pale layer tucked behind existing ink. The layers build up into a halo that
  // is strongest near the stroke.
  const bleedStep = () => {
    const live = drawing()
    for (const rec of [...wet, ...live]) {
      ctx = rec.layer ?? baseCtx
      // Bleeds like the pen it was drawn with.
      const ink = PEN_STYLES[rec.pen] ?? PEN_STYLES[DEFAULT_PEN]
      let stillWet = false
      for (const g of rec.groups) {
        // Drawn before this page opened: the bleeding it has already done is
        // caught up in a few layers at once, rather than one every BLEED_STEP
        // (which would be both slow to appear and, with a sheet's worth of
        // strokes arriving together, a lot of work every frame).
        if (g.catchUp > 0) {
          const done = Math.min(g.catchUp, BLEED_TIME)
          g.catchUp = 0
          const layers = Math.max(1, Math.min(BLEED_CATCHUP, Math.round(done / BLEED_STEP)))
          for (let i = 1; i <= layers; i++) bleedLayer(rec, ink, g, (done * i) / layers, done / layers)
          g.t = now - done
          g.next = now + BLEED_STEP
        }
        const age = now - g.t
        if (age >= BLEED_TIME) continue
        stillWet = true
        // Each part lays a thin layer every BLEED_STEP, on its own schedule, so
        // the halo creeps smoothly and the work is spread across frames.
        if (now < g.next) continue
        g.next = Math.max(g.next + BLEED_STEP, now)
        bleedLayer(rec, ink, g, age, BLEED_STEP)
      }
      // Fully bled: the remembered path is no longer needed.
      if (!stillWet && !live.includes(rec)) {
        rec.groups = []
        wet.splice(wet.indexOf(rec), 1)
      }
    }
  }

  // Point at u (0–1) between p1 and p2 on a centripetal Catmull-Rom spline
  // through p0..p3 (Barry–Goldman form). Centripetal spacing keeps the curve
  // from overshooting or looping on sharp turns and uneven point spacing.
  const splinePoint = (p0, p1, p2, p3, u) => {
    const knot = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)))
    const t1 = knot(p0, p1)
    const t2 = t1 + knot(p1, p2)
    const t3 = t2 + knot(p2, p3)
    const t = t1 + (t2 - t1) * u
    const mix = (a, b, ta, tb) => {
      const k = (t - ta) / (tb - ta)
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
    const a1 = mix(p0, p1, 0, t1)
    const a2 = mix(p1, p2, t1, t2)
    const a3 = mix(p2, p3, t2, t3)
    const b1 = mix(a1, a2, 0, t2)
    const b2 = mix(a2, a3, t1, t3)
    return mix(b1, b2, t1, t2)
  }

  // Lays ink along the curve from p1 to p2 in short nib steps, blending the
  // line width between the two points.
  const drawCurve = (p0, p1, p2, p3) => {
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const steps = Math.max(1, Math.ceil((len * 1.15) / (1.5 * px)))
    let prev = p1
    const trail = [p1]
    let widest = 0
    for (let i = 1; i <= steps; i++) {
      const u = i / steps
      const q = splinePoint(p0, p1, p2, p3, u)
      widest = Math.max(widest, stamp(prev.x, prev.y, q.x, q.y, p1.w + (p2.w - p1.w) * u))
      trail.push(q)
      prev = q
    }
    // The stretch's age and direction, as one line as wide as the nib reached
    // (these maps are coarse and padded, so they needn't follow each step).
    recordTrail(trail, widest, p2.x - p1.x, p2.y - p1.y)
    stroke.sx = p2.x
    stroke.sy = p2.y
  }
  // Records age and direction along a line of points (canvas px) swept by a
  // nib reaching `half` either side, travelling (dx, dy).
  const recordTrail = (points, half, dx, dy) => {
    const line = (c) => {
      c.beginPath()
      c.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y)
    }
    const width = 2 * half + 2.6 * px
    stampDir(line, dx, dy, width, false)
    stampAge(line, width, false)
  }

  // Draws the last stretch up to the newest point, bending only from behind
  // (used when the pen pauses or lifts, before the next point is known).
  const drawTail = () => {
    const pts = stroke.pts
    const n = pts.length
    if (stroke.tailDrawn || n < 2) return
    drawCurve(pts[n - 3] ?? pts[n - 2], pts[n - 2], pts[n - 1], pts[n - 1])
    stroke.tailDrawn = true
  }

  // A fast stroke stopping dead: its ink keeps going and splatters forward in a
  // cone ahead of the pen, some drops trailing a short tail back toward it.
  const splat = () => {
    stroke.splatted = true
    if (pen.splatAmount <= 0) return
    const s = Math.min(2, Math.max(0.6, 0.6 + (stroke.peak - pen.splatSpeed) / pen.splatSpeed)) * pen.splatAmount
    const heading = Math.atan2(stroke.dirY, stroke.dirX)
    // The nib surges as it stops.
    blot(stroke.sx + stroke.dirX * nib() * 0.2, stroke.sy + stroke.dirY * nib() * 0.2, nib() * 0.32, 0.3)
    const count = Math.round((3 + Math.random() * 4) * s)
    for (let i = 0; i < count; i++) {
      const a = heading + (Math.random() - 0.5) * 1.0
      const dist = nib() * (0.5 + Math.random() ** 0.7 * 3.2 * Math.sqrt(s))
      const size = nib() * (0.04 + Math.random() ** 2.2 * 0.17)
      const x = stroke.sx + Math.cos(a) * dist
      const y = stroke.sy + Math.sin(a) * dist
      blot(x, y, size, 0.3)
      if (Math.random() < 0.4) {
        // Tail: shrinking drops back toward the pen.
        const len = size * (2 + Math.random() * 3)
        for (let k = 1; k <= 3; k++) {
          blot(x - Math.cos(a) * len * (k / 3), y - Math.sin(a) * len * (k / 3), size * (0.75 - k * 0.17), 0.2)
        }
      }
    }
  }

  // Clears fully faded ink from one tile (only pixels that are actually that
  // old, so newer ink on top survives), and their ages and directions, so the
  // inked area shrinks and faded ink can't come back.
  const clearTile = (k) => {
    const x0 = (k % cols) * TILE
    const y0 = Math.floor(k / cols) * TILE
    const w = Math.min(TILE, canvas.width - x0)
    const h = Math.min(TILE, canvas.height - y0)
    if (w <= 0 || h <= 0) return
    const ink = baseCtx.getImageData(x0, y0, w, h)
    const ax0 = x0 >> 1
    const ay0 = y0 >> 1
    const aw = Math.min(ageCanvas.width - ax0, (w + 1) >> 1)
    const ah = Math.min(ageCanvas.height - ay0, (h + 1) >> 1)
    if (aw <= 0 || ah <= 0) return
    const ageImg = ageCtx.getImageData(ax0, ay0, aw, ah)
    const age = ageImg.data
    const nowStep = uniforms.inkNowStep.value
    const life = (INK_LIFESPAN + INK_FADE) / AGE_STEP
    let changed = false
    for (let y = 0; y < h; y++) {
      const ar = Math.min(ah - 1, y >> 1) * aw
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (!ink.data[i + 3]) continue
        const j = (ar + Math.min(aw - 1, x >> 1)) * 4
        if (age[j + 3] && nowStep - age[j] >= life) {
          ink.data[i] = ink.data[i + 1] = ink.data[i + 2] = ink.data[i + 3] = 0
          changed = true
        }
      }
    }
    if (changed) baseCtx.putImageData(ink, x0, y0)
    // Expired ages (and directions there) are cleared too, so later strokes'
    // soft edges can claim them.
    const dirImg = dirCtx.getImageData(ax0, ay0, aw, ah)
    let agesChanged = false
    for (let i = 0; i < age.length; i += 4) {
      if (age[i + 3] && nowStep - age[i] >= life) {
        age[i] = age[i + 1] = age[i + 2] = age[i + 3] = 0
        dirImg.data[i] = dirImg.data[i + 1] = dirImg.data[i + 2] = dirImg.data[i + 3] = 0
        agesChanged = true
      }
    }
    if (agesChanged) {
      ageCtx.putImageData(ageImg, ax0, ay0)
      dirCtx.putImageData(dirImg, ax0, ay0)
    }
    if (changed || agesChanged) dirtyTiles.add(k)
  }

  // Per frame for a pen that's drawing (nowMs on the pointer-event clock): a
  // sudden stop with no more pointer movement splatters; resting ink spreads
  // into a growing, darkening pool.
  const penUpdate = (dt, nowMs) => {
    const idle = nowMs - stroke.t
    // The pen has paused: bring the line all the way to it.
    if (idle > 30) drawTail()
    if (idle > 45 && !stroke.splatted) {
      if (stroke.peak * Math.exp(-idle / 150) > pen.splatSpeed * 0.7) splat()
      else stroke.splatted = true
    }
    if (idle < 90) return
    if (stroke.rest >= pen.restTime) return
    stroke.rest = Math.min(pen.restTime, stroke.rest + dt)
    const grow = stroke.rest / pen.restTime
    blot(stroke.sx, stroke.sy, nib() * pen.blotRest * (0.35 + 0.65 * Math.sqrt(grow)), 0.04)
  }

  // The selected pen lifts off.
  const penEnd = () => {
    if (!stroke.active) return
    drawTail()
    // Lifting the pen leaves a blot, and a quick flick can throw droplets.
    if (Math.random() < 0.6) blot(stroke.sx, stroke.sy, nib() * pen.blotLift * (0.7 + Math.random() * 0.6), 0.25)
    if (stroke.speed > 700 && Math.random() < pen.flickChance) {
      const drops = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < drops; i++) {
        const along = nib() * (1.5 + Math.random() * 3)
        const side = (Math.random() - 0.5) * nib()
        blot(
          stroke.sx + stroke.dirX * along - stroke.dirY * side,
          stroke.sy + stroke.dirY * along + stroke.dirX * side,
          nib() * (0.07 + Math.random() * 0.12),
          0.3,
        )
      }
    }
    stroke.active = false
    penState.lastUp = performance.now()
    // Merge the stroke into the finished ink and clear its layer. In one go
    // over everything it touched: a copy between two canvases costs about the
    // same whatever area it covers (the whole source is taken each time), so a
    // copy per tile would be many times slower on a long stroke.
    if (current) {
      let tx0 = Infinity
      let ty0 = Infinity
      let tx1 = -Infinity
      let ty1 = -Infinity
      for (const k of current.tiles) {
        const tx = k % cols
        const ty = Math.floor(k / cols)
        if (tx < tx0) tx0 = tx
        if (ty < ty0) ty0 = ty
        if (tx > tx1) tx1 = tx
        if (ty > ty1) ty1 = ty
      }
      if (tx1 >= tx0) {
        const x = tx0 * TILE
        const y = ty0 * TILE
        const w = Math.min(canvas.width, (tx1 + 1) * TILE) - x
        const h = Math.min(canvas.height, (ty1 + 1) * TILE) - y
        baseCtx.drawImage(ctx.canvas, x, y, w, h, x, y, w, h)
        ctx.clearRect(x, y, w, h)
      }
      current.layer = null
    }
    if (current && INK_LIFESPAN > 0) {
      current.expires = (current.born + ageBase) * AGE_STEP + INK_LIFESPAN + INK_FADE + AGE_STEP + 0.5
      records.push(current)
    }
    if (current?.groups.length) wet.push(current)
    current = penState.current = null
  }

  return {
    texture,
    bounds,
    uniforms,
    get width() {
      return canvas.width
    },
    get height() {
      return canvas.height
    },

    // Match the sheet's size, keeping any ink already painted. Ink stays where
    // it was relative to the logo, scaled with it, so it's never stretched and
    // stays on the logo. anchor: where the logo's centre is on the canvas (cx,
    // cy, px) and the length it's sized from (base, px); by default the middle
    // and the shorter side.
    resize(w, h, pixelsPerCss, anchor = { cx: w / 2, cy: h / 2, base: Math.min(w, h) }) {
      px = pixelsPerCss
      const prev = logoAnchor
      logoAnchor = anchor
      if (canvas.width === w && canvas.height === h && prev && Math.abs(prev.cx - anchor.cx) < 0.5 && Math.abs(prev.cy - anchor.cy) < 0.5) return
      // Fold any strokes in progress into the finished ink first.
      for (const p of pens.values()) {
        if (!p.layer) continue
        if (canvas.width > 1) baseCtx.drawImage(p.layer.canvas, 0, 0)
        p.layer = null
        if (p.current) p.current.layer = null
      }
      // Old canvas px → new: p * k + (ox, oy), keeping the logo's centre put.
      const from = prev ?? { cx: canvas.width / 2, cy: canvas.height / 2, base: Math.min(canvas.width, canvas.height) }
      const k = anchor.base / from.base
      const ox = anchor.cx - from.cx * k
      const oy = anchor.cy - from.cy * k
      const copy = (src) => {
        if (src.width <= 1) return null
        const c = document.createElement('canvas')
        c.width = src.width
        c.height = src.height
        c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0)
        return c
      }
      const inkCopy = copy(canvas)
      const dirCopy = copy(dirCanvas)
      const ageCopy = copy(ageCanvas)
      if (canvas.width > 1) ageReach *= w / canvas.width
      canvas.width = w
      canvas.height = h
      cols = Math.ceil(w / TILE)
      if (inkCopy) baseCtx.drawImage(inkCopy, ox, oy, inkCopy.width * k, inkCopy.height * k)
      dirCanvas.width = Math.ceil(w / 2)
      dirCanvas.height = Math.ceil(h / 2)
      if (dirCopy) dirCtx.drawImage(dirCopy, ox / 2, oy / 2, dirCopy.width * k, dirCopy.height * k)
      ageCanvas.width = dirCanvas.width
      ageCanvas.height = dirCanvas.height
      if (ageCopy) {
        // Ages must not be blended when scaled.
        ageCtx.imageSmoothingEnabled = false
        ageCtx.drawImage(ageCopy, ox / 2, oy / 2, ageCopy.width * k, ageCopy.height * k)
      }
      maskCtx.canvas.width = ageCanvas.width
      maskCtx.canvas.height = ageCanvas.height
      // Drawn in ink-canvas coordinates.
      for (const c of [dirCtx, ageCtx, maskCtx]) c.setTransform(0.5, 0, 0, 0.5, 0, 0)
      for (const p of pens.values()) {
        if (!p.current) continue
        p.layer = newLayer()
        p.current.layer = p.layer
      }
      if (inkCopy) {
        const X = (x) => x * k + ox
        const Y = (y) => y * k + oy
        for (const r of new Set([...records, ...wet, ...drawing()])) {
          r.x0 = X(r.x0)
          r.x1 = X(r.x1)
          r.y0 = Y(r.y0)
          r.y1 = Y(r.y1)
          // Tiles no longer line up; take every tile under the stroke's box.
          r.tiles = new Set()
          markUpload(r.x0, r.y0, r.x1, r.y1, r)
          for (const g of r.groups ?? []) {
            g.x0 = X(g.x0)
            g.x1 = X(g.x1)
            g.y0 = Y(g.y0)
            g.y1 = Y(g.y1)
            g.half *= k
            for (let i = 0; i < g.line.length; i += 2) {
              g.line[i] = X(g.line[i])
              g.line[i + 1] = Y(g.line[i + 1])
            }
            for (let i = 0; i < g.blots.length; i += 3) {
              g.blots[i] = X(g.blots[i])
              g.blots[i + 1] = Y(g.blots[i + 1])
              g.blots[i + 2] *= k
            }
          }
        }
        // Strokes still being drawn carry on from the same spot.
        for (const { stroke: st } of pens.values()) {
          st.x = X(st.x)
          st.y = Y(st.y)
          st.sx = X(st.sx)
          st.sy = Y(st.sy)
          for (const pt of st.pts) {
            pt.x = X(pt.x)
            pt.y = Y(pt.y)
          }
        }
      }
      makePattern()
      // The canvases were reallocated, so re-upload them whole.
      for (const t of [texture, dirTexture, ageTexture]) {
        t.dispose()
        t.needsUpdate = true
      }
      clearQueue.clear()
      dirtyTiles.clear()
    },

    // Wipes all ink off the sheet, strokes in progress included.
    clear() {
      for (const [id, p] of pens) {
        if (p.stroke.active) {
          select(id)
          p.stroke.active = false
        }
        p.current = null
        p.layer = null
      }
      current = null
      ctx = baseCtx
      for (const c of [baseCtx, dirCtx, ageCtx]) c.clearRect(0, 0, canvas.width, canvas.height)
      records.length = 0
      wet.length = 0
      clearQueue.clear()
      dirtyTiles.clear()
      recomputeBounds()
      for (const t of [texture, dirTexture, ageTexture]) t.needsUpdate = true
    },

    // The pen a given pen id draws with, from its next stroke on (see PENS).
    setPenStyle(id, name) {
      if (!PEN_STYLES[name]) return
      select(id)
      penState.pen = name
      penName = name
      pen = PEN_STYLES[name]
    },

    // Scene time in seconds; call once per frame before drawing.
    setTime(t) {
      now = t + HEADROOM
      // Strokes are stamped with the step they began in, on this same clock
      // (`now`, the head start included), so the shader is given the step it
      // is now — otherwise ink would be cleared away before it began to fade.
      // Ages only go up to 255 steps, so everything is shifted down well
      // before the count runs out.
      if (ageStepAt(now) > 250) rebase(ageStepAt(now) - 125)
      uniforms.inkNowStep.value = now / AGE_STEP - ageBase
    },

    // How big the pen is against the sizes in PEN_STYLES (1 = as given). The
    // sheet and its logo scale with the screen's shorter side, so a pen fixed
    // in CSS px would draw a line half again as heavy, against the drawing, on
    // a phone as on a desktop; the scene scales it with the sheet.
    setPenScale(s) {
      penScale = s
    },

    // How far (CSS px) the shader softens ink edges, so ages cover that too.
    setBlurReach(cssPx) {
      ageReach = cssPx * px
    },

    // Methods that draw take a pen id (default 'user'), so pens don't interfere.
    // begin's options: age, in seconds, for a stroke that was drawn earlier
    // (so it fades when it would have).
    begin(x, y, t, id = 'user', { age = 0 } = {}) {
      select(id)
      const streaks = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => [
        Math.random() * 1.6 - 0.8,
        0.35 + Math.random() * 0.35,
      ])
      Object.assign(stroke, {
        active: true,
        x,
        y,
        sx: x,
        sy: y,
        t,
        width: pen.widthSlow * 0.9,
        speed: 0,
        peak: 0,
        peakT: t,
        splatted: true,
        dist: 0,
        hollowPhase: Math.random() * 100,
        streaks,
        rest: 0,
        pts: [{ x, y, w: pen.widthSlow * 0.9 }],
        tailDrawn: true,
      })
      current = penState.current = { x0: x, y0: y, x1: x, y1: y, groups: [], tiles: new Set(), layer: ctx, born: Math.max(0, ageStepAt(now - Math.min(age, HEADROOM))), pen: penName, aged: age }
      // The nib touching down leaves a small blot.
      blot(x, y, nib() * pen.blotTouch * (0.8 + Math.random() * 0.4), 0.2)
      const half = stamp(x, y, x + 0.01, y + 0.01, stroke.width)
      recordTrail([{ x, y }, { x: x + 0.01, y: y + 0.01 }], half, 0, 0)
    },

    // Pointer moved to (x, y) at time t (ms). The stroke is a smooth curve
    // through the pointer positions, drawn one stretch behind the newest point
    // (the next point is needed to know how the curve bends). The line is widest
    // when slow and thins as the pen speeds up.
    move(x, y, t, id = 'user') {
      select(id)
      if (!stroke.active) return
      const dt = Math.max(1, t - stroke.t)
      const dist = Math.hypot(x - stroke.x, y - stroke.y)
      const speed = (dist / px / dt) * 1000
      // Direction of travel, ignoring tiny jitters.
      if (dist > 1.5 * px) {
        stroke.dirX = (x - stroke.x) / dist
        stroke.dirY = (y - stroke.y) / dist
      }
      stroke.x = x
      stroke.y = y
      stroke.t = t
      stroke.speed += (speed - stroke.speed) * 0.3
      stroke.peak = Math.max(stroke.peak * Math.exp(-(t - stroke.peakT) / 150), stroke.speed)
      stroke.peakT = t
      if (dist > 0.5 * px) stroke.rest = 0

      const fast = Math.min(1, stroke.speed / fastAt())
      const target = pen.widthSlow + (pen.widthFast - pen.widthSlow) * (1 - (1 - fast) ** 2)
      stroke.width += (target - stroke.width) * 0.25

      // Ignore jitter too small to bend the curve.
      const pts = stroke.pts
      const last = pts[pts.length - 1]
      if (Math.hypot(x - last.x, y - last.y) >= 0.75 * px) {
        pts.push({ x, y, w: stroke.width })
        const n = pts.length
        // Now the curve's bend there is known, draw the stretch between the
        // previous two points (unless a pause already drew it); the newest
        // stretch waits for the next point.
        if (n >= 3 && !stroke.tailDrawn) drawCurve(pts[n - 4] ?? pts[n - 3], pts[n - 3], pts[n - 2], pts[n - 1])
        stroke.tailDrawn = false
        if (n > 4) pts.shift()
      }

      // Moving again re-arms the splatter; nearly stopping after speed fires it.
      if (speed > pen.splatStop * 2) stroke.splatted = false
      else if (speed < pen.splatStop && !stroke.splatted && stroke.peak > pen.splatSpeed) splat()
    },

    // Per frame (nowMs on the pointer-event clock): a sudden stop with no more
    // pointer movement splatters; resting ink spreads into a growing, darkening
    // pool; strokes past their lifespan are cleared.
    update(dt, nowMs) {
      // Each still-wet part of the ink checks whether its next layer is due.
      if (pen.bleed > 0 && (wet.length || drawing().length)) bleedStep()
      if (INK_LIFESPAN > 0) {
        // Strokes past their lifespan and fade: clear their ink, a few tiles
        // per frame.
        let expired = false
        for (let i = records.length - 1; i >= 0; i--) {
          if (records[i].expires > now) continue
          for (const k of records[i].tiles) clearQueue.add(k)
          records.splice(i, 1)
          expired = true
        }
        if (expired) recomputeBounds()
        // A few tiles a frame, so clearing a sheet's worth of faded ink never
        // costs a frame; with the page in another tab there's no frame to
        // spare and a backlog to clear, so it goes faster.
        let budget = document.hidden ? 64 : 4
        for (const k of clearQueue) {
          clearQueue.delete(k)
          clearTile(k)
          if (--budget === 0) break
        }
      }
      for (const [id, p] of pens) {
        // A pen that hasn't drawn for a while gives its layer back; it gets a
        // fresh one when it next draws.
        if (!p.stroke.active && !p.current && p.layer && performance.now() - (p.lastUp ?? 0) > 5000) {
          p.layer = null
          continue
        }
        if (!p.stroke.active) continue
        select(id)
        penUpdate(dt, nowMs)
      }
    },

    end(id = 'user') {
      select(id)
      penEnd()
    },

    // Upload only the tiles painted (or wiped) since the last frame, as one
    // rectangle per horizontal run of tiles.
    flush(renderer) {
      if (!dirtyTiles.size) return
      // Rows go in top-down; WebGL flips them to match the textures (flipY).
      const upload = (data, target, rx, ry, rw, rh, fullH) => {
        const patch = new THREE.DataTexture(data, rw, rh, THREE.RGBAFormat, THREE.UnsignedByteType)
        renderer.copyTextureToTexture(patch, target, null, new THREE.Vector2(rx, fullH - ry - rh))
        patch.dispose()
      }
      const tiles = [...dirtyTiles].sort((a, b) => a - b)
      dirtyTiles.clear()
      for (let i = 0; i < tiles.length; ) {
        const ty = Math.floor(tiles[i] / cols)
        const tx0 = tiles[i] % cols
        let tx1 = tx0
        while (i + 1 < tiles.length && tiles[i + 1] === tiles[i] + 1 && Math.floor(tiles[i + 1] / cols) === ty) {
          i++
          tx1++
        }
        i++
        const x = tx0 * TILE
        const y = ty * TILE
        const w = Math.min(canvas.width, (tx1 + 1) * TILE) - x
        const h = Math.min(canvas.height, y + TILE) - y
        if (w <= 0 || h <= 0) continue
        // Strokes in progress go on top of the finished ink; strips they don't
        // touch are sent straight from the finished ink.
        const layers = []
        for (const p of pens.values()) {
          const tiles = p.current?.tiles
          if (!p.layer || !tiles) continue
          for (let tx = tx0; tx <= tx1; tx++) {
            if (tiles.has(ty * cols + tx)) {
              layers.push(p.layer)
              break
            }
          }
        }
        // Blended here rather than with drawImage, which copies the whole
        // source canvas each time it has changed.
        const d = baseCtx.getImageData(x, y, w, h).data
        for (const layer of layers) {
          const s = layer.getImageData(x, y, w, h).data
          for (let j = 0; j < d.length; j += 4) {
            const sa = s[j + 3]
            if (!sa) continue
            const da = d[j + 3]
            if (sa === 255 || !da) {
              d[j] = s[j]
              d[j + 1] = s[j + 1]
              d[j + 2] = s[j + 2]
              d[j + 3] = sa
              continue
            }
            // "source-over" with straight (unpremultiplied) alpha.
            const a = sa / 255
            const b = (da / 255) * (1 - a)
            const k = 1 / (a + b)
            d[j] = (s[j] * a + d[j] * b) * k
            d[j + 1] = (s[j + 1] * a + d[j + 1] * b) * k
            d[j + 2] = (s[j + 2] * a + d[j + 2] * b) * k
            d[j + 3] = (a + b) * 255
          }
        }
        upload(new Uint8Array(d.buffer), texture, x, y, w, h, canvas.height)
        const dx = x / 2
        const dy = y / 2
        const dw = Math.min(dirCanvas.width, Math.ceil((x + w) / 2)) - dx
        const dh = Math.min(dirCanvas.height, Math.ceil((y + h) / 2)) - dy
        if (dw > 0 && dh > 0) {
          upload(new Uint8Array(dirCtx.getImageData(dx, dy, dw, dh).data.buffer), dirTexture, dx, dy, dw, dh, dirCanvas.height)
          upload(new Uint8Array(ageCtx.getImageData(dx, dy, dw, dh).data.buffer), ageTexture, dx, dy, dw, dh, ageCanvas.height)
        }
      }
    },

    dispose() {
      texture.dispose()
      dirTexture.dispose()
      ageTexture.dispose()
    },
  }
}
