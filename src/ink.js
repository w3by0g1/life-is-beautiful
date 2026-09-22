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

// Nib length (CSS px), its angle (degrees; negative tilts it up to the right),
// the line's width as a fraction of the nib when moving slowly and when fast,
// and the speed (CSS px/s) at which it reaches its thinnest.
const NIB_SIZE = 15
const NIB_ANGLE = -38
const NIB_WIDTH_SLOW = 1.35
const NIB_WIDTH_FAST = 0.18
const NIB_FAST = 900
// Ink colours: the core, the halftone dots printed over it, and the edge (also
// used for the streaks that run along each stroke).
const INK_CORE = '#161d19'
const INK_DOT = '#2c3b31'
const INK_EDGE = '#1c3526'
// Halftone cell size (CSS px) and how visible its dots are (0 = none).
const DOT_CELL = 4
const DOT_STRENGTH = 0.25
// Pooling: the deeper colour ink builds up to where it gathers, and how strongly
// slow strokes pool (0 = never).
const INK_POOL_COLOR = '#060a07'
const POOLING = 1
// Blotting: how big blots get (fraction of the nib) where the pen touches down,
// lifts off, or rests in one place (growing over REST_TIME seconds), and the
// chance of flicking droplets off the end of a fast stroke.
const BLOT_TOUCH = 0.35
const BLOT_LIFT = 0.3
const BLOT_REST = 0.9
const REST_TIME = 1.5
const FLICK_CHANCE = 0.5
// Splatter when a fast stroke stops dead: the pen must have been moving at
// least SPLAT_SPEED (CSS px/s) and drop below SPLAT_STOP; SPLAT_AMOUNT scales
// how much ink is thrown (0 = never).
const SPLAT_SPEED = 900
const SPLAT_STOP = 60
const SPLAT_AMOUNT = 1
// Lifespan: seconds each stroke stays at full strength from when it's drawn (0
// = forever), then how many seconds it takes to fade away.
const INK_LIFESPAN = 300
const INK_FADE = 3
// Bleeding: after ink lands it slowly spreads into the paper as a pale, diluted
// halo. BLEED scales it (0 = off); BLEED_SPREAD is how far it creeps (fraction
// of the nib), over BLEED_TIME seconds (fast at first, then slowing); the halo
// is built up in faint layers of BLEED_COLOR every BLEED_STEP seconds, each part
// of a stroke on its own schedule; BLEED_LAYER_ALPHA is how much it builds up
// per 0.2 s.
const BLEED = 0.3
const BLEED_SPREAD = 0.1
const BLEED_TIME = 4
const BLEED_STEP = 0.1
const BLEED_COLOR = '#7d9486'
const BLEED_LAYER_ALPHA = 0.035

// The stroke is remembered for bleeding in groups of this many seconds'
// drawing, each spreading on its own schedule.
const BLEED_GROUP = 0.15
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
  // Scene time in seconds (pauses with the page).
  let now = 0
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
  let patternTile = null
  let patterns = new WeakMap()
  // The core's halftone fill, for the context being drawn on.
  const corePattern = () => {
    let p = patterns.get(ctx)
    if (!p) patterns.set(ctx, (p = ctx.createPattern(patternTile, 'repeat')))
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

  const makePattern = () => {
    const cell = Math.max(2, Math.round(DOT_CELL * px))
    const tile = document.createElement('canvas')
    tile.width = tile.height = cell
    const t = tile.getContext('2d')
    t.fillStyle = INK_CORE
    t.fillRect(0, 0, cell, cell)
    t.fillStyle = INK_DOT
    t.globalAlpha = DOT_STRENGTH
    t.beginPath()
    t.arc(cell / 2, cell / 2, cell * 0.24, 0, Math.PI * 2)
    t.fill()
    patternTile = tile
    patterns = new WeakMap()
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
    if (!penState) pens.set(id, (penState = { stroke: makeStroke(), current: null, layer: null }))
    if (!penState.layer) penState.layer = newLayer()
    stroke = penState.stroke
    current = penState.current
    ctx = penState.layer
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
  // where no stroke has claimed it yet.
  const stampDir = (path, dx, dy) => {
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
    dirCtx.lineWidth = 2 * DIR_REACH * px
    path(dirCtx)
    dirCtx.fill()
    dirCtx.stroke()
    dirCtx.globalCompositeOperation = 'source-over'
    dirCtx.lineWidth = 2 * px
    path(dirCtx)
    dirCtx.fill()
    dirCtx.stroke()
  }

  // Records the stroke's age over a shape (drawn a little wider than the ink,
  // so the whole of it, edges included, gets an age).
  const stampAge = (path, width) => {
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
    ageCtx.fill()
    ageCtx.stroke()
    // The ink itself is newest: it's painted over whatever was under it. One
    // age texel wider than the ink, so the blended rim of this shape lands
    // just outside the ink rather than on its edge pixels.
    ageCtx.globalCompositeOperation = 'source-over'
    ageCtx.lineWidth = width + 4
    path(ageCtx)
    ageCtx.fill()
    ageCtx.stroke()
  }

  // Keeps where the stroke went so it can bleed later, grouped by when it was
  // drawn: the nib's path as a polyline (NaN separates breaks), its typical
  // half-thickness, and blots as [x, y, r].
  const groupFor = () => {
    const bucket = Math.floor(now / BLEED_GROUP)
    let g = current.groups[current.groups.length - 1]
    if (!g || g.bucket !== bucket) {
      g = { bucket, t: now, line: [], blots: [], half: 0, n: 0, next: now + BLEED_STEP, wobble: 0.9 + Math.random() * 0.2, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
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
    if (!current || BLEED <= 0) return
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
    if (!current || BLEED <= 0) return
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
    const ang = ((NIB_ANGLE + (Math.random() - 0.5) * 6) * Math.PI) / 180
    const half = (NIB_SIZE / 2) * px * width * (1 + (Math.random() - 0.5) * 0.16)
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
    ctx.fillStyle = corePattern()
    ctx.strokeStyle = corePattern()
    quad(0.72)
    ctx.fill()
    ctx.lineWidth = 1.1 * px
    hair()
    ctx.stroke()

    // Slow strokes pool: a little deeper colour builds up with each overlapping step.
    const slow = Math.max(0, 1 - stroke.speed / 500)
    if (POOLING > 0 && slow > 0) {
      ctx.globalAlpha = 0.045 * slow * POOLING
      ctx.fillStyle = INK_POOL_COLOR
      quad(0.6)
      ctx.fill()
    }

    // Streaks along the stroke at fixed offsets across the nib.
    ctx.strokeStyle = INK_EDGE
    ctx.lineCap = 'round'
    for (const [k, alpha] of stroke.streaks) {
      ctx.globalAlpha = alpha
      ctx.lineWidth = 0.9 * px
      ctx.beginPath()
      ctx.moveTo(x0 + nx * k * 0.72, y0 + ny * k * 0.72)
      ctx.lineTo(x1 + nx * k * 0.72, y1 + ny * k * 0.72)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = INK_EDGE
    ctx.strokeStyle = INK_EDGE
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2 * px
    quad(1)
    ctx.fill()
    ctx.stroke()
    ctx.lineWidth = 2.6 * px
    hair()
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'

    stampDir((c) => quadPath(c, x0, y0, x1, y1, nx, ny, 1), x1 - x0, y1 - y0)
    stampAge((c) => quadPath(c, x0, y0, x1, y1, nx, ny, 1), 2.6 * px)
    const pad = Math.abs(nx) + Math.abs(ny) + (4 + DIR_REACH) * px + ageReach
    const bx0 = Math.min(x0, x1) - pad
    const by0 = Math.min(y0, y1) - pad
    const bx1 = Math.max(x0, x1) + pad
    const by1 = Math.max(y0, y1) + pad
    markDirty(bx0, by0, bx1, by1)
    rememberStep(x0, y0, x1, y1, half, bx0, by0, bx1, by1)
  }

  // An ink blot: a wobbly pool with a deeper-coloured middle and the red edge.
  // `deepen` is how much pooled colour to add (repeat blots build it up).
  const blot = (x, y, r, deepen = 0.25) => {
    const phases = [Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3]
    const shape = (k) => blotPath(ctx, x, y, r, k, phases)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = corePattern()
    shape(1)
    ctx.fill()
    if (POOLING > 0) {
      ctx.globalAlpha = deepen * POOLING
      ctx.fillStyle = INK_POOL_COLOR
      shape(0.8)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = INK_EDGE
    shape(1)
    ctx.lineWidth = 2.4 * px
    ctx.strokeStyle = INK_EDGE
    ctx.stroke()
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    stampAge((c) => blotPath(c, x, y, r, 1, phases), 2.4 * px)
    const pad = r * 1.3 + 4 * px + ageReach
    markDirty(x - pad, y - pad, x + pad, y + pad)
    rememberBlot(x, y, r, x - pad, y - pad, x + pad, y + pad)
  }

  const nib = () => NIB_SIZE * px

  // Spreads still-wet ink a little further into the paper: each group of the
  // stroke is redrawn widened by how far its ink has crept by now, as a faint
  // pale layer tucked behind existing ink. The layers build up into a halo that
  // is strongest near the stroke.
  const bleedStep = () => {
    const live = drawing()
    for (const rec of [...wet, ...live]) {
      ctx = rec.layer ?? baseCtx
      let stillWet = false
      for (const g of rec.groups) {
        const age = now - g.t
        if (age >= BLEED_TIME) continue
        stillWet = true
        // Each part lays a thin layer every BLEED_STEP, on its own schedule, so
        // the halo creeps smoothly and the work is spread across frames.
        if (now < g.next) continue
        g.next = Math.max(g.next + BLEED_STEP, now)
        const spread = BLEED_SPREAD * BLEED * nib() * (1 - Math.exp((-3 * age) / BLEED_TIME))
        if (spread < 0.3 * px) continue
        const grow = spread * g.wobble

        ctx.globalCompositeOperation = 'destination-over'
        ctx.globalAlpha = 1 - (1 - BLEED_LAYER_ALPHA) ** (BLEED_STEP / 0.2)
        ctx.fillStyle = ctx.strokeStyle = BLEED_COLOR
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
    for (let i = 1; i <= steps; i++) {
      const u = i / steps
      const q = splinePoint(p0, p1, p2, p3, u)
      stamp(prev.x, prev.y, q.x, q.y, p1.w + (p2.w - p1.w) * u)
      prev = q
    }
    stroke.sx = p2.x
    stroke.sy = p2.y
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
    if (SPLAT_AMOUNT <= 0) return
    const s = Math.min(2, Math.max(0.6, 0.6 + (stroke.peak - SPLAT_SPEED) / SPLAT_SPEED)) * SPLAT_AMOUNT
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
      if (stroke.peak * Math.exp(-idle / 150) > SPLAT_SPEED * 0.7) splat()
      else stroke.splatted = true
    }
    if (idle < 90) return
    if (stroke.rest >= REST_TIME) return
    stroke.rest = Math.min(REST_TIME, stroke.rest + dt)
    const grow = stroke.rest / REST_TIME
    blot(stroke.sx, stroke.sy, nib() * BLOT_REST * (0.35 + 0.65 * Math.sqrt(grow)), 0.04)
  }

  // The selected pen lifts off.
  const penEnd = () => {
    if (!stroke.active) return
    drawTail()
    // Lifting the pen leaves a blot, and a quick flick can throw droplets.
    if (Math.random() < 0.6) blot(stroke.sx, stroke.sy, nib() * BLOT_LIFT * (0.7 + Math.random() * 0.6), 0.25)
    if (stroke.speed > 700 && Math.random() < FLICK_CHANCE) {
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
    // Merge the stroke into the finished ink, tile by tile, and clear its layer.
    if (current) {
      for (const k of current.tiles) {
        const x = (k % cols) * TILE
        const y = Math.floor(k / cols) * TILE
        baseCtx.drawImage(ctx.canvas, x, y, TILE, TILE, x, y, TILE, TILE)
        ctx.clearRect(x, y, TILE, TILE)
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

    // Match the paper's texture size, keeping any ink already painted. Ink stays
    // where it was relative to the middle of the page, scaled with the shorter
    // side (as the logo is), so it's never stretched and stays on the logo.
    resize(w, h, pixelsPerCss) {
      px = pixelsPerCss
      if (canvas.width === w && canvas.height === h) return
      // Fold any strokes in progress into the finished ink first.
      for (const p of pens.values()) {
        if (!p.layer) continue
        if (canvas.width > 1) baseCtx.drawImage(p.layer.canvas, 0, 0)
        p.layer = null
        if (p.current) p.current.layer = null
      }
      // Old canvas px → new: p * k + (ox, oy).
      const k = Math.min(w, h) / Math.min(canvas.width, canvas.height)
      const ox = (w - canvas.width * k) / 2
      const oy = (h - canvas.height * k) / 2
      const copy = (src) => {
        if (src.width <= 1) return null
        const c = document.createElement('canvas')
        c.width = src.width
        c.height = src.height
        c.getContext('2d').drawImage(src, 0, 0)
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

    // Scene time in seconds; call once per frame before drawing.
    setTime(t) {
      now = t
      if (ageStepAt(t) > 250) rebase(ageStepAt(t) - 125)
      uniforms.inkNowStep.value = t / AGE_STEP - ageBase
    },

    // How far (CSS px) the shader softens ink edges, so ages cover that too.
    setBlurReach(cssPx) {
      ageReach = cssPx * px
    },

    // Methods that draw take a pen id (default 'user'), so pens don't interfere.
    begin(x, y, t, id = 'user') {
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
        width: NIB_WIDTH_SLOW * 0.9,
        speed: 0,
        peak: 0,
        peakT: t,
        splatted: true,
        streaks,
        rest: 0,
        pts: [{ x, y, w: NIB_WIDTH_SLOW * 0.9 }],
        tailDrawn: true,
      })
      current = penState.current = { x0: x, y0: y, x1: x, y1: y, groups: [], tiles: new Set(), layer: ctx, born: ageStepAt(now) }
      // The nib touching down leaves a small blot.
      blot(x, y, nib() * BLOT_TOUCH * (0.8 + Math.random() * 0.4), 0.2)
      stamp(x, y, x + 0.01, y + 0.01, stroke.width)
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

      const fast = Math.min(1, stroke.speed / NIB_FAST)
      const target = NIB_WIDTH_SLOW + (NIB_WIDTH_FAST - NIB_WIDTH_SLOW) * (1 - (1 - fast) ** 2)
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
      if (speed > SPLAT_STOP * 2) stroke.splatted = false
      else if (speed < SPLAT_STOP && !stroke.splatted && stroke.peak > SPLAT_SPEED) splat()
    },

    // Per frame (nowMs on the pointer-event clock): a sudden stop with no more
    // pointer movement splatters; resting ink spreads into a growing, darkening
    // pool; strokes past their lifespan are cleared.
    update(dt, nowMs) {
      // Each still-wet part of the ink checks whether its next layer is due.
      if (BLEED > 0 && (wet.length || drawing().length)) bleedStep()
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
        let budget = 4
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
