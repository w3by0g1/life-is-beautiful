import * as THREE from 'three'
import { createDust } from './dust.js'
import { createFog, FOG_GLSL } from './fog.js'
import { createInk, DEFAULT_PEN, PENS } from './ink.js'
import { createHaze } from './haze.js'
import { createIntro } from './intro.js'
import { createTilt } from './tilt.js'
import { createLiveSketch } from './liveSketch.js'
import { LOGO_FRACTION } from './layout.js'
import { generatePaperTextures } from './paperTextures.js'

// Logo diameter as a fraction of the shorter screen side.
// Panning the view (see setPan): seconds a pan takes, eased in and out.
const PAN_TIME = 0.7
// Seconds the ink takes to fade out or back in when drawing is switched off
// or on (see setDrawing).
const INK_TOGGLE_TIME = 0.6
// Upper bound on the long side of the generated textures, in pixels.
const MAX_TEX = 2048
// The ink is drawn at up to this size on its long side, so strokes stay crisp at
// full screen resolution (Retina included).
const INK_MAX_TEX = 4096
// Width of the rounded profile around each stroke; higher is softer and rounder.
const ROUNDNESS = 3.2
// Overall light level; calibrated so flat paper renders at its gradient colours.
const LIGHT_GAIN = 1.065
// Total light on flat paper (before LIGHT_GAIN), in three.js intensity units.
const FLAT_LIGHT = 3
// Share of FLAT_LIGHT that is soft ambient light; lower gives darker shadows.
const AMBIENT = 0.45
// Height of the key light (it circles at radius 6); lower is more raking.
const KEY_HEIGHT = 1.6
// Relief strength of the logo and of the paper fibres in the normal maps.
const LOGO_STRENGTH = 11.5
const FIBRE_STRENGTH = 0.35
// Load animation: seconds before the logo starts rising, and how long it takes.
const EMBOSS_DELAY = 1
const EMBOSS_DURATION = 3
// Light movement: how briskly the light swings toward the pointer (higher is
// snappier; it eases in and out either way) and its idle drift speed (rad/s).
const LIGHT_FOLLOW = 5
const LIGHT_IDLE_SPEED = 0.25
// On phones, tilting steers the light instead of touches (see tilt.js).
// TILT_DEAD_ZONE: degrees of tilt ignored (below it the light drifts as when
// idle). TILT_LIGHT_FROM_ABOVE: the light behaves like a lamp fixed overhead,
// so tipping one edge down lights the sheet from the opposite side; false makes
// the light follow the edge tipped down instead.
const TILT_DEAD_ZONE = 3
const TILT_LIGHT_FROM_ABOVE = true
// Click deboss: radius and soft edge width of the pressed area (world units;
// the screen is 2 tall), how far the raised logo is pushed in (1 = as deep as
// it was raised, 0 = just flattened), and how fast it presses in and springs
// back (higher is faster; roughly 1/seconds).
const PRESS_RADIUS = 0.1
const PRESS_EDGE = 0.1
const PRESS_INVERT = 1
const PRESS_IN_RATE = 14
const PRESS_OUT_RATE = 3.5
// How tightly the pressed spot follows the pointer while dragging.
const PRESS_DRAG_FOLLOW = 20
// Dragging leaves a trail of pressed spots, one every TRAIL_SPACING (world
// units), each recovering to embossed at TRAIL_RECOVER (roughly 1/seconds).
// TRAIL_COUNT spots are reused, overwriting whichever has recovered most.
const TRAIL_COUNT = 48
const TRAIL_SPACING = 0.05
const TRAIL_RECOVER = 1.4
// Dragging also paints a black calligraphy trail (see ink.js); false turns it off.
const PAINT = true
// Ink look: how far its edges bleed into the paper (CSS px), how much the paper
// fibres make the edge wick unevenly, and how much ink pools darker at the edge.
const INK_BLEED = 2.2
const INK_WICK = 1
const INK_POOL = 0.45
// Ink density varies in soft blotches across a stroke (0 = even).
const INK_BLOTCH = 0.5
// Ink and the paper surface: how much ink skips (goes patchy) on raised logo
// lines, and how much darker it sits where it runs into grooves (scratches,
// valley folds, and logo lines pressed in by clicking).
const INK_SKIP = 0.7
const INK_GROOVE = 0.35
// The nib hops over raised logo lines as it crosses them: it presses right up
// against the side it comes from, then lands a little past the line, leaving a
// clean gap at the line's foot on the side it's leaving. Running along a line
// leaves no gap. How far from a raised line the nib is held off (CSS px), how
// strongly (0 = off, 1 = bare paper at the foot, above 1 = bare paper over
// more of the soft edge), and which side the gap is on (true: the side the pen
// leaves; false: the side it comes from).
const INK_BASE_REACH = 5
const INK_BASE_GAP = 1
// How much ink lands on top of the raised logo lines (0 = none: the nib rides
// over them without marking them; 1 = as on the paper).
const INK_ON_LOGO = 0
const INK_GAP_AFTER = true
// Cast shadows from the raised logo: how far a full-height ridge's shadow
// reaches across the paper (the screen's shorter side is 2, so it stays the
// same length relative to the logo on any screen shape) and how dark it is.
const SHADOW_LENGTH = 0.08
const SHADOW_STRENGTH = 0.45
// Pool of light the key light throws on the paper: its centre sits POOL_OFFSET
// from the middle toward the light and fades out over POOL_RADIUS (world units;
// the screen is 2 tall). Inside it the paper brightens and warms slightly; away
// from it the paper dims.
const POOL_OFFSET = 1.1
const POOL_RADIUS = 1.8
const POOL_BRIGHT = 0.06
const POOL_DARK = 0.1
const POOL_TINT = new THREE.Color(0xffffff)
// Extra shade across the half of the page facing away from the light, deepening
// from the middle to FAR_SIDE_REACH (world units) beyond it.
const FAR_SIDE_DARK = 0.12
const FAR_SIDE_REACH = 1.6
// Strength of the vellum speckle and cloudy formation; 0 turns it off.
const SPECKLE = 1
// Strength of the clumpy pulp texture in the paper surface; 0 turns it off.
const PULP = 0.6
// Long, curly mulberry-style fibres laid in the paper: how many (1 = default
// density) and how strongly they're raised and tinted; 0 turns them off.
const FIBRES = 0.5
// How much the fibres bend and wander; lower is straighter.
const FIBRE_CURL = 0.25
// Fibre length range, in CSS pixels.
const FIBRE_LENGTH_MIN = 20
const FIBRE_LENGTH_MAX = 40
// Fibres lie roughly horizontal, tilted by up to this many degrees either way.
const FIBRE_ANGLE_SPREAD = 50
// How far the fibres stand up from the paper surface.
const FIBRE_RELIEF = 0.8
// Scratches pressed into the paper: how many (1 = default) and how deep; 0 turns them off.
const SCRATCHES = 1
const SCRATCH_DEPTH = 2
// Fold creases across the sheet: how many, how far the tilted paper either side
// of a fold spreads (CSS px), how strongly it tilts, and how dark the worn line is.
const CREASES = 2
const CREASE_WIDTH = 100
const CREASE_TILT = 0.06
const CREASE_LINE = 0.05
// Where the folds cross, the paper rounds into a soft pillowed patch this many
// CSS px across (radius); 0 keeps a sharp X.
const CREASE_ROUND = 40
const FIBRE_COLOR = [171, 188, 195]

// Paper colour: a diagonal linear gradient from the top-left corner to the
// bottom-right, with faint fibre mottling and a vellum-style speckle.
// Any CSS colour works: 'rgb(247, 251, 252)', '#f7fbfc', 'ivory', …
const PAPER_FROM = 'rgb(247, 251, 252)'
const PAPER_TO = 'rgb(229, 229, 229)'

// Haze over the whole scene, like light through tracing paper: blur (CSS px),
// how much of the blurred scene is mixed in (0 = off), and a white wash over it.
const HAZE_BLUR = 10
const HAZE_AMOUNT = 0.4
const HAZE_TINT = 0.12
// How much of the haze lies over ink (1 = as over the paper). Lower keeps
// dark ink dark: over thin lines the haze is mostly the paper around them.
const INK_HAZE = 0.25

// The screen's shorter side (CSS px) that the pen sizes in ink.js are drawn
// for; on a smaller screen the pen scales down with the sheet.
const PEN_AT = 820

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// CSS colour string → [r, g, b] in 0–255 (sRGB, as written).
function cssToRgb(css) {
  const hex = new THREE.Color(css).getHex()
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

// Everything the texture generator needs, read from the settings above.
// One seed per page load, so a resize rebuilds the same sheet.
const PAPER_SEED = (Math.random() * 2 ** 32) >>> 0
function textureSettings() {
  return {
    seed: PAPER_SEED,
    logoFraction: LOGO_FRACTION,
    roundness: ROUNDNESS,
    logoStrength: LOGO_STRENGTH,
    fibreStrength: FIBRE_STRENGTH,
    shadowLength: SHADOW_LENGTH,
    speckle: SPECKLE,
    pulp: PULP,
    fibres: FIBRES,
    fibreCurl: FIBRE_CURL,
    fibreLengthMin: FIBRE_LENGTH_MIN,
    fibreLengthMax: FIBRE_LENGTH_MAX,
    fibreAngleSpread: FIBRE_ANGLE_SPREAD,
    fibreRelief: FIBRE_RELIEF,
    fibreColor: FIBRE_COLOR,
    scratches: SCRATCHES,
    scratchDepth: SCRATCH_DEPTH,
    creases: CREASES,
    creaseWidth: CREASE_WIDTH,
    creaseTilt: CREASE_TILT,
    creaseLine: CREASE_LINE,
    creaseRound: CREASE_ROUND,
    paperFrom: cssToRgb(PAPER_FROM),
    paperTo: cssToRgb(PAPER_TO),
  }
}

// Builds the paper textures in a Web Worker so the page stays smooth while it
// works (it takes a moment at full resolution). Falls back to building them on
// the main thread where workers can't draw to canvases.
function createTextureBuilder(logoImg, onReady) {
  let worker = null
  let nextId = 0
  let latest = 0
  const canUseWorker =
    typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined'
  const ready = (async () => {
    if (!canUseWorker) return
    try {
      worker = new Worker(new URL('./paperTextures.worker.js', import.meta.url), { type: 'module' })
      const bitmap = await createImageBitmap(logoImg)
      worker.postMessage({ type: 'logo', bitmap }, [bitmap])
      worker.onmessage = (e) => {
        // Only the most recent request matters (e.g. after several resizes).
        if (e.data.id === latest) onReady(e.data)
      }
      worker.onerror = () => {
        worker.terminate()
        worker = null
      }
    } catch {
      worker = null
    }
  })()

  return {
    // layout: extra settings for this sheet (where the logo goes, etc.).
    async request(w, h, px, layout = {}) {
      await ready
      const id = (latest = ++nextId)
      const settings = { ...textureSettings(), ...layout }
      if (worker) {
        worker.postMessage({ type: 'generate', id, w, h, px, settings })
      } else {
        // Let the page paint first, then build here.
        setTimeout(() => {
          if (id !== latest) return
          onReady({ id, w, h, ...generatePaperTextures(logoImg, w, h, px, settings) })
        }, 0)
      }
    },
    dispose() {
      worker?.terminate()
    },
  }
}

// A static RGBA8 texture from generated data. No mipmaps: the sheet is always
// seen head-on at about one texel per pixel. The CPU copy is dropped once the
// data is on the GPU.
function makeDataTexture(data, w, h, srgb, mirror = true) {
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  // Mirrored, so while a resize is settling the old textures cover the new
  // window with plausible paper rather than smeared edge pixels. (Not the
  // logo, which would be reflected; its edges are blank, so clamping is clean.)
  if (mirror) texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  texture.onUpdate = () => {
    texture.image.data = null
  }
  return texture
}

// options.panExtent: how far (CSS px) the view may be panned, { left, right,
// top, bottom } (see setPan): the sheet is built with that much extra paper on
// its left (for panning right), right (for panning left), top (for panning
// down) and bottom (for panning up).
// options.onReady: called once the sheet appears (its textures are built and
// its shader compiled), so the page can take away whatever it showed while it
// was coming.
export async function createPaperScene(container, logoUrl, options = {}) {
  // No antialiasing, depth or alpha buffers: the scene is one flat sheet with
  // soft-edged dust, so they'd only cost memory (a lot of it on Retina screens).
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    depth: false,
    stencil: false,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  // No tone mapping, so the paper's gradient colours come through as specified.
  renderer.toneMapping = THREE.NoToneMapping
  // Fade in once the paper textures are ready.
  renderer.domElement.style.opacity = '0'
  renderer.domElement.style.transition = 'opacity 0.6s ease'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()

  // Orthographic camera looking straight down; screen-up is world -z so the
  // top of the texture sits at the top of the screen.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20)
  camera.position.set(0, 10, 0)
  camera.up.set(0, 0, -1)
  camera.lookAt(0, 0, 0)

  // A low raking key light is what makes an emboss readable. Shadow depth is
  // set by how much of the light is ambient: less ambient means the sides of the
  // ridges facing away from the key fall into darker shadow. The key's intensity
  // is derived so flat paper always receives the same total light (three.js
  // divides diffuse light by π), keeping the gradient colours exact.
  const keyDistance = Math.hypot(KEY_HEIGHT, 6)
  const keyFlatFactor = KEY_HEIGHT / keyDistance
  scene.add(new THREE.HemisphereLight('#ffffff', '#ffffff', AMBIENT * LIGHT_GAIN))
  const key = new THREE.DirectionalLight(
    '#ffffff',
    ((FLAT_LIGHT - AMBIENT) / keyFlatFactor) * LIGHT_GAIN,
  )
  scene.add(key)

  const logoImg = await loadImage(logoUrl)
  const fog = createFog()

  // The paper's shader is MeshStandardMaterial's, patched. Its textures:
  //   map        — paper colour
  //   normalMap  — RG surface normal, B fibre texture (ink wicking), A grooves
  //   logoMap    — RG logo normal, B logo height, A where its shadows reach
  //   paintMap   — painted ink
  // The logo's relief is scaled by `emboss` (0 = flat, 1 = full) and flipped to
  // a deboss around the pointer when pressed; plain paper is left untouched.
  const paperMat = new THREE.MeshStandardMaterial({ roughness: 0.92 })
  const embossUniforms = {
    ...fog.uniforms,
    logoMap: { value: null },
    emboss: { value: 0 },
    pressCenter: { value: new THREE.Vector2() },
    pressAmount: { value: 0 },
    // The intro replay's press, alongside the user's.
    ghostCenter: { value: new THREE.Vector2() },
    ghostAmount: { value: 0 },
    pressActive: { value: 0 },
    pressRadius: { value: PRESS_RADIUS },
    pressEdge: { value: PRESS_EDGE },
    pressInvert: { value: PRESS_INVERT },
    paintMap: { value: null },
    inkBounds: { value: null },
    inkSkip: { value: INK_SKIP },
    inkBaseReach: { value: 1 },
    inkBaseGap: { value: INK_BASE_GAP },
    inkOnLogo: { value: INK_ON_LOGO },
    inkGapSide: { value: INK_GAP_AFTER ? 1 : -1 },
    inkDebug: { value: 0 },
    inkGroove: { value: INK_GROOVE },
    inkBlotch: { value: INK_BLOTCH },
    paintTexel: { value: new THREE.Vector2(1, 1) },
    inkBleed: { value: 1 },
    inkWick: { value: INK_WICK },
    inkPool: { value: INK_POOL },
    lightDir: { value: new THREE.Vector2(1, 0) },
    shadowLength: { value: SHADOW_LENGTH },
    shadowStrength: { value: SHADOW_STRENGTH },
    poolOffset: { value: POOL_OFFSET },
    poolRadius: { value: POOL_RADIUS },
    poolBright: { value: POOL_BRIGHT },
    poolDark: { value: POOL_DARK },
    farSideDark: { value: FAR_SIDE_DARK },
    farSideReach: { value: FAR_SIDE_REACH },
    poolTint: { value: POOL_TINT },
    // Trail spots as (x, z, amount).
    pressTrail: { value: Array.from({ length: TRAIL_COUNT }, () => new THREE.Vector3()) },
    paperAspect: { value: 1 },
    // Screen UV → UV in the paper textures and in the ink canvas (scale xy,
    // offset zw). Identity except just after a resize, while those are still
    // laid out for the old window size (see `fit`).
    paperRemap: { value: new THREE.Vector4(1, 1, 0, 0) },
    // How far the view is panned, as a fraction of the screen's width and
    // height (the sheet, and everything on it, moves right and down by this
    // much).
    panU: { value: 0 },
    panV: { value: 0 },
    inkRemap: { value: new THREE.Vector4(1, 1, 0, 0) },
  }
  paperMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, embossUniforms)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <normalmap_pars_fragment>',
        `#include <normalmap_pars_fragment>
        ${FOG_GLSL}
        uniform sampler2D logoMap;
        uniform float emboss;
        uniform vec2 pressCenter;
        uniform float pressAmount;
        uniform vec2 ghostCenter;
        uniform float ghostAmount;
        uniform float pressActive;
        uniform float pressRadius;
        uniform float pressEdge;
        uniform float pressInvert;
        uniform vec3 pressTrail[${TRAIL_COUNT}];
        float pressMask(vec2 p, vec2 c) {
          return 1.0 - smoothstep(pressRadius - pressEdge, pressRadius, length(p - c));
        }
        uniform float paperAspect;
        uniform vec4 paperRemap;
        uniform float panU;
        uniform float panV;
        uniform vec4 inkRemap;
        uniform sampler2D paintMap;
        uniform vec4 inkBounds;
        // How strongly all the ink shows.
        uniform float inkOpacity;
        uniform sampler2D inkAgeMap;
        uniform float inkNowStep;
        uniform float inkAgeStep;
        uniform float inkLifespan;
        uniform float inkFade;
        // How much of the ink at uv is still alive (1 = fresh, 0 = faded away),
        // from the step its stroke began in. Smoothly sampled: red is the time
        // step, alpha marks spots that have an age, so red / alpha averages only
        // those. No age nearby at all only happens in the soft edge of live
        // ink, so that counts as alive.
        float inkLife(vec2 uv) {
          vec4 a = texture2D(inkAgeMap, uv);
          if (a.a < 0.02) return 1.0;
          float born = a.r / a.a * 255.0;
          float age = ( inkNowStep - born ) * inkAgeStep;
          return 1.0 - smoothstep(inkLifespan, inkLifespan + inkFade, age);
        }
        uniform float inkSkip;
        uniform float inkBaseReach;
        uniform sampler2D inkDirMap;
        uniform float inkDebug;
        uniform float inkBaseGap;
        uniform float inkOnLogo;
        uniform float inkGapSide;
        uniform float inkGroove;
        uniform float inkBlotch;
        uniform vec2 paintTexel;
        uniform float inkBleed;
        uniform float inkWick;
        uniform float inkPool;
        uniform vec2 lightDir;
        uniform float shadowLength;
        uniform float shadowStrength;
        uniform float poolOffset;
        uniform float poolRadius;
        uniform float poolBright;
        uniform float poolDark;
        uniform float farSideDark;
        uniform float farSideReach;
        uniform vec3 poolTint;
        vec3 linearToDisplay(vec3 c) {
          c = clamp(c, 0.0, 1.0);
          return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }`,
      )
      // The colour map is read at the remapped UV too.
      .replace(
        '#include <map_fragment>',
        `vec2 paperUv = vNormalMapUv * paperRemap.xy + paperRemap.zw;
        vec2 inkUv = vNormalMapUv * inkRemap.xy + inkRemap.zw;
        ${THREE.ShaderChunk.map_fragment.replaceAll('vMapUv', 'paperUv')}`,
      )
      // Includes aren't expanded yet at this point, so expand this chunk to patch it.
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'mapN.xy *= normalScale;',
          `// Normals are stored as x,y only; rebuild z.
          vec4 surfT = texture2D( normalMap, paperUv );
          mapN = vec3( surfT.xy * 2.0 - 1.0, 0.0 );
          mapN.z = sqrt( max( 1e-4, 1.0 - dot( mapN.xy, mapN.xy ) ) );
          vec4 logoT = texture2D( logoMap, paperUv );
          vec3 logoN = vec3( logoT.xy * 2.0 - 1.0, 0.0 );
          logoN.z = sqrt( max( 1e-4, 1.0 - dot( logoN.xy, logoN.xy ) ) );

          // World position: x right, z down the screen (UV v runs up the screen).
          // Panning moves the sheet (and the light and fog over it) like a
          // camera move.
          vec2 wp = vec2( ( vNormalMapUv.x - panU - 0.5 ) * 2.0 * paperAspect, ( 0.5 - vNormalMapUv.y - panV ) * 2.0 );

          // Within the pointer's circle the logo's relief is flipped from raised
          // to pressed in, fading back to raised across the soft edge. Deepest
          // of the live press and the recovering trail spots, so overlapping
          // spots merge into one channel rather than stacking. Skipped entirely
          // when nothing is pressed.
          float press = 0.0;
          if ( pressActive > 0.5 ) {
            press = max( pressAmount * pressMask( wp, pressCenter ), ghostAmount * pressMask( wp, ghostCenter ) );
            for ( int i = 0; i < ${TRAIL_COUNT}; i++ ) {
              press = max( press, pressTrail[ i ].z * pressMask( wp, pressTrail[ i ].xy ) );
            }
          }
          float relief = emboss * mix( 1.0, -pressInvert, press );

          // Ink: soften the painted canvas with a small ring blur so it bleeds,
          // let the paper fibres push the edge in and out so it wicks unevenly,
          // and pool darker just inside the edge as it dries. Only where ink has
          // been laid (plus the blur's reach); within that, the outer ring is
          // sampled first and the rest skipped if there's no ink nearby.
          vec2 inkMargin = paintTexel * ( inkBleed * 2.0 + 2.0 );
          // The age map marks every spot within reach of ink (its soft edge
          // included), so one sample of it rules out the rest of the ink
          // work almost everywhere inside the bounds.
          if ( inkOpacity > 0.0 &&
               all( greaterThanEqual( inkUv, inkBounds.xy - inkMargin ) ) &&
               all( lessThanEqual( inkUv, inkBounds.zw + inkMargin ) ) &&
               texture2D( inkAgeMap, inkUv ).a > 0.003 ) {
          // Every sample is faded by its own stroke's age, so a faded stroke
          // contributes nothing while live ink right next to it still shows.
          vec4 inkC = texture2D( paintMap, inkUv );
          if ( inkC.a > 0.0 ) inkC.a *= inkLife( inkUv );
          vec3 rgbOut = vec3( 0.0 );
          float aOut = 0.0;
          for ( int i = 0; i < 8; i++ ) {
            float ia = float( i ) * 0.7854;
            vec2 uv2 = inkUv + vec2( cos( ia ), sin( ia ) ) * paintTexel * inkBleed * 2.0;
            vec4 s2 = texture2D( paintMap, uv2 );
            if ( s2.a > 0.0 ) s2.a *= inkLife( uv2 );
            rgbOut += s2.rgb * s2.a;
            aOut += s2.a;
          }
          if ( inkC.a + aOut > 0.0 ) {
            vec3 rgbIn = vec3( 0.0 );
            float aIn = 0.0;
            for ( int i = 0; i < 8; i++ ) {
              float ia = float( i ) * 0.7854;
              vec2 uv1 = inkUv + vec2( cos( ia ), sin( ia ) ) * paintTexel * inkBleed;
              vec4 s1 = texture2D( paintMap, uv1 );
              if ( s1.a > 0.0 ) s1.a *= inkLife( uv1 );
              rgbIn += s1.rgb * s1.a;
              aIn += s1.a;
            }
            vec3 inkRGB = inkC.rgb * inkC.a + rgbIn * 0.8 + rgbOut * 0.45;
            float inkA = inkC.a + aIn * 0.8 + aOut * 0.45;
            vec3 inkCol = inkRGB / max( inkA, 1e-4 );
            inkA /= 1.0 + 8.0 * ( 0.8 + 0.45 );

            // Fibre texture for wicking, averaged over a couple of texels so the
            // edge stays ragged without single-pixel holes.
            float fibreN = 0.5 * ( surfT.b + texture2D( normalMap, paperUv + paintTexel * vec2( 1.5, -1.0 ) ).b ) - 0.5;
            float inkCover = smoothstep( 0.12, 0.6, inkA + fibreN * 2.0 * inkWick );
            float inkRing = inkCover * ( 1.0 - smoothstep( 0.4, 0.95, inkA ) );
            inkCol *= 1.0 - inkPool * inkRing;
            // Uneven density: soft blotches where more ink soaked in.
            inkCol *= 1.0 - inkBlotch * smoothstep( 0.35, 0.8, fogFbm( wp * 7.0 + 13.0 ) );

            // The ink meets the surface: it skips in patches over raised logo
            // lines, and creeps into and pools darker in grooves (scratches,
            // valley folds, and logo lines pressed in).
            float logoH = logoT.b * relief;
            float raised = smoothstep( 0.35, 0.9, logoH );
            float sunk = smoothstep( 0.2, 0.8, -logoH );
            float grooveAll = max( surfT.a, sunk );
            // Skipping thins the ink in soft blotches (never down to bare
            // paper), and heavy or pooled ink fills back in.
            float skipPatch = smoothstep( 0.4, 0.7, fogFbm( wp * 24.0 + 7.0 ) );
            float skip = inkSkip * raised * skipPatch * ( 1.0 - smoothstep( 0.7, 1.0, inkA ) );
            inkCover *= 1.0 - 0.75 * skip;
            inkCover = max( inkCover, smoothstep( 0.04, 0.3, inkA ) * grooveAll );
            inkCol *= 1.0 - inkGroove * grooveAll;
            // None anywhere on the raised logo lines: from where they first
            // rise, not just at their tops, so nothing of a stroke shows on
            // them. (Their embossed shape, not the press, so it holds as the
            // ink goes down.)
            inkCover *= mix( 1.0, inkOnLogo, smoothstep( 0.02, 0.1, logoT.b * emboss ) );

            // The foot of raised lines: low here, but a raised line close by
            // that the pen has just hopped over holds the nib up off the paper
            // (see INK_BASE_GAP). Only near the logo. Uses the logo's raised
            // shape (emboss), not the press, so the gap is there as the ink
            // goes down, even though the pen pushes the logo in.
            // For the debug view: the foot zone, how much of it is cut, and
            // the direction the pen was travelling (UV axes) if known.
            float footZone = 0.0;
            float footCut = 0.0;
            vec4 dirT = texture2D( inkDirMap, inkUv );
            vec2 travel = dirT.a > 0.05 ? dirT.rg / dirT.a * 2.0 - 1.0 : vec2( 0.0 );
            // Stored in canvas axes (y down); UV v runs up.
            travel.y = -travel.y;
            if ( ( inkBaseGap > 0.0 || inkDebug > 0.5 ) && logoT.a > 0.0 && emboss > 0.0 ) {
              float nearH = 0.0;
              // Points from here toward the raised line(s) nearby.
              vec2 toRidge = vec2( 0.0 );
              // (Ink texels → screen → paper UV.)
              vec2 reachUv = paintTexel * inkBaseReach / inkRemap.xy * paperRemap.xy;
              for ( int i = 0; i < 8; i++ ) {
                float ia = float( i ) * 0.7854;
                vec2 d = vec2( cos( ia ), sin( ia ) );
                float hFar = texture2D( logoMap, paperUv + d * reachUv ).b;
                float hNear = texture2D( logoMap, paperUv + d * reachUv * 0.5 ).b;
                nearH = max( nearH, max( hFar, hNear ) );
                toRidge += d * ( hFar + hNear );
              }
              float held = smoothstep( 0.3, 0.7, nearH * emboss ) * ( 1.0 - smoothstep( 0.15, 0.45, logoT.b * emboss ) );
              // How squarely the pen is leaving the line: 1 heading straight
              // away from it, 0 running along it, below 0 coming towards it.
              // Where there's no direction (e.g. a blot) or no clear line
              // direction (between two lines), the gap is kept.
              float leaving = 1.0;
              if ( dirT.a > 0.05 && dot( toRidge, toRidge ) > 0.01 && dot( travel, travel ) > 0.01 ) {
                leaving = -dot( normalize( travel ), normalize( toRidge ) ) * inkGapSide;
              }
              footZone = held;
              held *= smoothstep( 0.25, 0.7, leaving );
              footCut = held;
              // Never below bare paper (strengths above 1 widen the clean part
              // rather than bleaching the paper).
              inkCover *= max( 0.0, 1.0 - inkBaseGap * held );
            }
            diffuseColor.rgb = mix( diffuseColor.rgb, inkCol, inkCover * inkOpacity );

            // Debug view (D key or ?debug): ink tinted by the direction it was
            // drawn in; at the foot of raised lines, green where the gap is cut
            // (the pen is leaving the line) and blue where it isn't (the pen
            // is coming up against it, or running along it).
            if ( inkDebug > 0.5 ) {
              float inkHere = smoothstep( 0.02, 0.3, inkA ) * inkOpacity;
              if ( dirT.a > 0.05 ) {
                float a = atan( travel.y, travel.x );
                vec3 hue = 0.5 + 0.5 * cos( a + vec3( 0.0, 2.094, 4.189 ) );
                diffuseColor.rgb = mix( diffuseColor.rgb, hue, 0.55 * inkHere );
              }
              diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.1, 0.85, 0.25 ), 0.9 * footCut * inkHere );
              diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.15, 0.35, 1.0 ), 0.9 * ( footZone - footCut ) * inkHere );
            }
          }
          }

          // Sum the paper's and the logo's slopes, i.e. their height fields.
          mapN = vec3( mapN.xy / mapN.z + logoN.xy / logoN.z * relief, 1.0 );
          mapN.xy *= normalScale;

          // Cast shadow: march toward the light over the logo's height; a point
          // is shaded where a ridge along the way rises above the light ray.
          // (The local relief factor is reused for the samples, which are close
          // by.) Only near the logo, where its shadows can reach.
          if ( logoT.a > 0.0 && abs( relief ) > 0.001 ) {
            vec2 toLightUv = vec2( lightDir.x / ( 2.0 * paperAspect ), -lightDir.y / 2.0 ) * paperRemap.xy;
            float h0 = logoT.b * relief;
            float occ = 0.0;
            for ( int i = 1; i <= 20; i++ ) {
              float t = shadowLength * float( i ) / 20.0;
              float hs = texture2D( logoMap, paperUv + toLightUv * t ).b * relief;
              occ = max( occ, hs - h0 - t / shadowLength );
            }
            diffuseColor.rgb *= 1.0 - smoothstep( 0.0, 0.3, occ ) * shadowStrength;
          }

          // Pool of light following the key light across the sheet.
          float pool = 1.0 - smoothstep( 0.0, poolRadius, length( wp - lightDir * poolOffset ) );
          diffuseColor.rgb *= mix( vec3( 1.0 - poolDark ), poolTint * ( 1.0 + poolBright ), pool );

          // Shade the side of the page facing away from the light.
          float away = smoothstep( 0.0, farSideReach, -dot( wp, lightDir ) );
          diffuseColor.rgb *= 1.0 - away * farSideDark;`,
        ),
      )
      // Output display (sRGB) values, as if drawn straight to the screen, then
      // lay the drifting fog over the lit paper.
      .replace(
        '#include <colorspace_fragment>',
        `gl_FragColor.rgb = linearToDisplay( gl_FragColor.rgb );
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogDensity( wp ) );`,
      )
  }
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), paperMat)
  paper.rotation.x = -Math.PI / 2
  // Hidden until its textures are ready (the shader patch relies on them).
  paper.visible = false
  scene.add(paper)

  const dust = createDust(scene, renderer.getPixelRatio())
  const ink = createInk()
  // The pen the user draws with (chosen in the dev menu; see ink.js).
  let userPen = DEFAULT_PEN
  // Hidden until the logo embosses, and while drawing is off (see the loop):
  // how far the drawing on/off fade has got (0–1).
  ink.uniforms.inkOpacity.value = 0
  let inkToggle = 1
  Object.assign(embossUniforms, ink.uniforms)
  embossUniforms.paintMap.value = ink.texture
  embossUniforms.inkBounds.value = ink.bounds
  const haze = createHaze(renderer, { blur: HAZE_BLUR, amount: HAZE_AMOUNT, tint: HAZE_TINT })
  haze.setMask(ink.texture, embossUniforms.inkRemap.value, ink.uniforms.inkOpacity, INK_HAZE)
  // Not over the raised logo, where the ink itself is held off (see
  // INK_ON_LOGO): otherwise the haze thinning alone would show the stroke.
  haze.setMaskHold(embossUniforms.logoMap, embossUniforms.paperRemap.value, embossUniforms.emboss, [0.02, 0.1])

  // Freshly built textures (on load, and after a resize) are uploaded to the
  // GPU one per frame, then swapped in together, so no single frame stalls.
  let introStart = null
  let pending = null
  // What the latest texture request, the paper textures in use, and the ink
  // canvas were laid out for: the window size (CSS px) and how much extra
  // paper there is around it, [w, h, left, right, top, bottom].
  let requestedSize = null
  let paperSize = null
  let inkSize = null
  const textures = createTextureBuilder(logoImg, ({ w, h, color, surface, logo }) => {
    for (const t of pending ?? []) t.dispose()
    pending = [
      makeDataTexture(color, w, h, true),
      makeDataTexture(surface, w, h, false),
      makeDataTexture(logo, w, h, false, false),
    ]
    pending.uploaded = 0
    // Only the latest request's result arrives.
    pending.size = requestedSize
  })
  let compiling = false
  const uploadPending = () => {
    if (!pending || compiling) return
    if (pending.uploaded < pending.length) {
      renderer.initTexture(pending[pending.uploaded++])
      return
    }
    const [color, surface, logo] = pending
    paperSize = pending.size
    fitRemaps()
    pending = null
    const first = !paperMat.map
    paperMat.map?.dispose()
    paperMat.normalMap?.dispose()
    embossUniforms.logoMap.value?.dispose()
    paperMat.map = color
    paperMat.normalMap = surface
    embossUniforms.logoMap.value = logo
    if (first) {
      // Adding the maps changes the shader. Compile it in the background (for
      // the offscreen target it's drawn into) before showing the paper, so the
      // page doesn't stall on the first frame.
      paperMat.needsUpdate = true
      compiling = true
      renderer.setRenderTarget(haze.target)
      const ready = renderer.compileAsync(scene, camera)
      renderer.setRenderTarget(null)
      ready.then(() => {
        compiling = false
        paper.visible = true
        introStart = elapsed
        renderer.domElement.style.opacity = '1'
        options.onReady?.()
      })
    }
  }

  // The sheet always matches the viewport. While the window is being resized the
  // view follows every frame (`fit`), and the paper textures and ink canvas,
  // which are costly to rebuild, are rebuilt at the new size once it settles
  // (`rebuild`). Until then they're shown as they were, centred and scaled
  // with the shorter side of the window like the logo, so nothing stretches
  // and ink stays where it was drawn on the logo.
  const viewSize = () => [container.clientWidth, container.clientHeight]

  // Screen UV → UV in something laid out for a window of size w × h (with
  // more paper around it: `left`, `right`, `top` and `bottom`), with the view
  // panned: the logo's centre lines up with the screen's (shifted by the pan),
  // and sizes scale with the shorter side, like the logo.
  const remap = (out, size) => {
    const [vw, vh] = viewSize()
    const [w, h, left = 0, right = 0, top = 0, bottom = 0] = size ?? [vw, vh]
    const totalW = w + left + right
    const totalH = h + top + bottom
    const k = Math.min(w, h) / Math.min(vw, vh)
    const sx = (vw * k) / totalW
    const sy = (vh * k) / totalH
    out.set(
      sx,
      sy,
      (left + w / 2 - (vw / 2 + pan.px) * k) / totalW,
      // (UV v runs up the screen, the sheet's y down it.)
      1 - (top + h / 2 + (vh / 2 - panY()) * k) / totalH,
    )
  }
  const fitRemaps = () => {
    remap(embossUniforms.paperRemap.value, paperSize)
    remap(embossUniforms.inkRemap.value, inkSize)
  }

  // The view's pan (see setPan): where it is and where it's easing to (CSS
  // px, across and down), and how far through the move it is (0–1). `restY`
  // is where the sheet sits when it isn't panned (see setRest).
  const pan = { px: 0, py: 0, fromX: 0, toX: 0, fromY: 0, toY: 0, t: 1 }
  let restY = 0
  const panY = () => pan.py + restY
  const panUniforms = () => {
    const [vw, vh] = viewSize()
    embossUniforms.panU.value = pan.px / vw
    embossUniforms.panV.value = panY() / vh
  }
  const stepPan = (dt) => {
    if (pan.t >= 1) return
    pan.t = Math.min(1, pan.t + dt / PAN_TIME)
    const e = pan.t < 0.5 ? 4 * pan.t ** 3 : 1 - (-2 * pan.t + 2) ** 3 / 2
    pan.px = pan.fromX + (pan.toX - pan.fromX) * e
    pan.py = pan.fromY + (pan.toY - pan.fromY) * e
    panUniforms()
    fitRemaps()
  }

  const fit = () => {
    const [vw, vh] = viewSize()
    const aspect = vw / vh
    renderer.setSize(vw, vh, false)
    haze.setSize(vw, vh, renderer.getPixelRatio())

    camera.left = -aspect
    camera.right = aspect
    camera.top = 1
    camera.bottom = -1
    camera.updateProjectionMatrix()
    paper.scale.set(aspect * 2, 2, 1)
    embossUniforms.paperAspect.value = aspect
    // Shadows are measured against the shorter side, like the logo, so they
    // keep the same length relative to it on tall phone screens (world units
    // run 2 per screen height).
    embossUniforms.shadowLength.value = SHADOW_LENGTH * Math.min(1, aspect)
    dust.setAspect(aspect)
    panUniforms()
    fitRemaps()
    // The page behind the canvas gets the same gradient as the paper (corner
    // to corner, as in paperTextures.js), for any area it doesn't cover.
    const angle = 180 - (Math.atan2(vw, vh) * 180) / Math.PI
    document.documentElement.style.backgroundImage = `linear-gradient(${angle}deg, ${PAPER_FROM}, ${PAPER_TO})`
  }

  // How much extra paper (CSS px) to build around the screen, for panning.
  const side = (v) => Math.max(0, Math.ceil(v ?? 0))
  const extent = (e) => ({ left: side(e?.left), right: side(e?.right), top: side(e?.top), bottom: side(e?.bottom) })
  let panExtent = extent(options.panExtent)
  const rebuild = () => {
    const [vw, vh] = viewSize()
    const { left, right, top, bottom } = panExtent
    const sheetW = vw + left + right
    const sheetH = vh + top + bottom
    const scale = Math.min(1, MAX_TEX / (Math.max(sheetW, sheetH) * renderer.getPixelRatio()))
    const tw = Math.round(sheetW * renderer.getPixelRatio() * scale)
    const th = Math.round(sheetH * renderer.getPixelRatio() * scale)
    // The ink covers the extra paper too, so names can be written there.
    const inkScale = Math.min(1, INK_MAX_TEX / (Math.max(sheetW, sheetH) * renderer.getPixelRatio()))
    const iw = Math.round(sheetW * renderer.getPixelRatio() * inkScale)
    const ih = Math.round(sheetH * renderer.getPixelRatio() * inkScale)
    const ipx = iw / sheetW
    ink.resize(iw, ih, ipx, { cx: (left + vw / 2) * ipx, cy: (top + vh / 2) * ipx, base: Math.min(vw, vh) * ipx })
    // A smaller screen holds a smaller sheet, so it takes a smaller pen (see
    // setPenScale); never below half, or a phone's lines would be wispy.
    ink.setPenScale(Math.min(1, Math.max(0.5, Math.min(vw, vh) / PEN_AT)))
    // Ink ages must cover the soft edge the shader gives ink (its outer ring).
    ink.setBlurReach(INK_BLEED * 2 + 1)
    inkSize = [vw, vh, left, right, top, bottom]
    embossUniforms.paintTexel.value.set(1 / iw, 1 / ih)
    embossUniforms.inkBleed.value = INK_BLEED * ipx
    embossUniforms.inkBaseReach.value = INK_BASE_REACH * ipx
    fitRemaps()
    // The old textures stay in use until the new ones are ready.
    requestedSize = [vw, vh, left, right, top, bottom]
    const tpx = tw / sheetW
    textures.request(tw, th, tpx, {
      logoX: (left + vw / 2) * tpx,
      logoY: (top + vh / 2) * tpx,
      logoBase: Math.min(vw, vh) * tpx,
    })
  }
  fit()
  rebuild()

  // Watch the container itself so the sheet tracks its real size, not just window resizes.
  let resizeTimer
  let lastSize = viewSize().join('x')
  const observer = new ResizeObserver(() => {
    const size = viewSize().join('x')
    if (size === lastSize) return
    lastSize = size
    fit()
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(rebuild, 200)
  })
  observer.observe(container)

  // Mouse steers the light around the sheet; otherwise it drifts slowly.
  const pointer = { x: 0, y: 0, active: false, touch: false }
  // Client position → world position on the sheet (x right, z down the screen),
  // and → ink canvas pixels.
  const toWorld = (e) => {
    const r = renderer.domElement.getBoundingClientRect()
    const u = (e.clientX - r.left) / r.width - embossUniforms.panU.value
    const v = (e.clientY - r.top) / r.height - embossUniforms.panV.value
    return [(u * 2 - 1) * embossUniforms.paperAspect.value, v * 2 - 1]
  }
  // (Through the same remap as the shader, so it lines up mid-resize too. The
  // remap is in UV, whose v runs up the screen, while the canvas's y runs
  // down, so its vertical offset is flipped here.)
  const toInk = (e) => {
    const r = renderer.domElement.getBoundingClientRect()
    const m = embossUniforms.inkRemap.value
    return [
      (((e.clientX - r.left) / r.width) * m.x + m.z) * ink.width,
      (((e.clientY - r.top) / r.height) * m.y + (1 - m.y - m.w)) * ink.height,
    ]
  }

  // Pressing pushes the logo in at the press point, dragging moves the press,
  // and it springs back on release. A quick click still plays the full press
  // (`pressing` lasts until it's in). The user and the intro replay each have
  // their own press, so they can draw at the same time.
  const makePress = (center, amount) => ({
    held: false,
    pressing: false,
    target: new THREE.Vector2(),
    lastDrop: new THREE.Vector2(),
    center: center.value,
    amount,
  })
  const presses = {
    user: makePress(embossUniforms.pressCenter, embossUniforms.pressAmount),
    ghost: makePress(embossUniforms.ghostCenter, embossUniforms.ghostAmount),
  }
  // A pen touching down, moving and lifting: its ink, and its press if it has
  // one (the shader holds one press for the user and one for the intro, so of
  // several fingers only the one drawing with the 'user' pen presses).
  const penDown = (id, e) => {
    const p = presses[id]
    if (p) {
      p.held = p.pressing = true
      p.target.set(...toWorld(e))
      p.center.copy(p.target)
      p.lastDrop.copy(p.target)
    }
    if (PAINT) ink.begin(...toInk(e), e.timeStamp, id)
  }
  const penMove = (id, e) => {
    const p = presses[id]
    if (p) {
      if (!p.held) return
      p.target.set(...toWorld(e))
    }
    if (!PAINT) return
    // Use every sample the browser collected since the last event for smooth curves.
    const events = e.getCoalescedEvents?.() ?? []
    for (const ev of events.length ? events : [e]) ink.move(...toInk(ev), ev.timeStamp, id)
  }
  const penUp = (id) => {
    const p = presses[id]
    if (p) p.held = false
    ink.end(id)
  }

  // Every finger draws its own stroke: each pointer holding the page takes a
  // pen of its own, from a handful of ids handed back as fingers lift. The one
  // holding 'user' also presses the logo and steers the light; the rest only
  // ink.
  const penIds = ['user']
  const pointerPens = new Map()
  const penFor = (pointerId) => {
    const held = new Set(pointerPens.values())
    let id = penIds.find((p) => !held.has(p))
    if (!id) penIds.push((id = `user${penIds.length + 1}`))
    pointerPens.set(pointerId, id)
    ink.setPenStyle(id, userPen)
    return id
  }
  // Lifts one pointer's pen, or (with no pointer) all of them.
  const release = (e) => {
    for (const [pointerId, id] of pointerPens) {
      if (e && pointerId !== e.pointerId) continue
      pointerPens.delete(pointerId)
      penUp(id)
    }
  }

  // The user's pointer: also steers the light (a mouse always; a finger only
  // where the phone's tilt isn't available).
  const tilt = createTilt()
  const onPointerMove = (e) => {
    const id = pointerPens.get(e.pointerId)
    // Only a pointer that isn't drawing (a mouse moving over the sheet) or the
    // one with the press moves the light; other fingers leave it be.
    if ((!id || id === 'user') && !(tilt.active && e.pointerType === 'touch')) {
      const r = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1
      pointer.active = true
      pointer.touch = e.pointerType === 'touch'
    }
    if (id) penMove(id, e)
  }
  const onPointerLeave = (e) => {
    pointer.active = false
    release(e)
  }
  const onPointerDown = (e) => {
    onPointerMove(e)
    penDown(penFor(e.pointerId), e)
    // Keep receiving moves while dragging, even past the edge of the canvas.
    // (A pointer that has already gone can't be captured; never mind.)
    try {
      renderer.domElement.setPointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  const onPointerUp = (e) => release(e)

  // Records drawings into a bank and replays them, at random, as a second
  // "ghost" pen that draws and presses but leaves the light alone; see intro.js.
  const intro = createIntro({
    element: renderer.domElement,
    // Replays follow the sheet when the view is panned.
    offset: () => pan.px,
    offsetY: () => panY(),
    // The dev panel's pen picker.
    pens: {
      list: PENS,
      get: () => userPen,
      set: (name) => {
        userPen = name
        for (const id of penIds) ink.setPenStyle(id, name)
      },
    },
    // The dev panel's Clear paper button: wipes this sheet at once, and the
    // shared drawing for everyone (through the dev server).
    clearPaper: () => {
      ink.clear()
      return fetch('/__clear-sketches', { method: 'POST' }).then((r) => {
        if (!r.ok) return r.text().then((t) => Promise.reject(new Error(t)))
      })
    },
    container,
    down: (e) => penDown('ghost', e),
    move: (e) => penMove('ghost', e),
    up: () => penUp('ghost'),
  })
  // Live drawing with everyone else on the site: the user's strokes are sent
  // as they're drawn, and other people's are drawn here (ink only; their pens
  // don't press the logo), each with the pen it was drawn with. See
  // liveSketch.js.
  const live = createLiveSketch({
    element: renderer.domElement,
    offset: () => pan.px,
    offsetY: () => panY(),
    penStyle: () => userPen,
    pen: {
      begin: (id, clientX, clientY, t, age, style) => {
        if (!PAINT) return
        ink.setPenStyle(id, style ?? DEFAULT_PEN)
        ink.begin(...toInk({ clientX, clientY }), t, id, { age })
      },
      move: (id, clientX, clientY, t) => PAINT && ink.move(...toInk({ clientX, clientY }), t, id),
      end: (id) => PAINT && ink.end(id),
    },
    onClear: () => ink.clear(),
  })
  // Pointer listeners: recorded for the intro (while recording) and sent live.
  // While drawing is off (see setDrawing) a press doesn't start a stroke (and
  // isn't sent); the pointer still steers the light.
  let drawing = true
  const logged = (kind, fn) => {
    const sent = live.listen(kind, fn)
    return intro.listen(kind, (e) => (kind === 'down' && !drawing ? onPointerMove(e) : sent(e)))
  }
  const listeners = [
    [renderer.domElement, 'pointermove', logged('move', onPointerMove)],
    [renderer.domElement, 'pointerleave', logged('leave', onPointerLeave)],
    [renderer.domElement, 'pointerdown', logged('down', onPointerDown)],
    [window, 'pointerup', logged('up', onPointerUp)],
    [window, 'pointercancel', logged('up', onPointerUp)],
    [window, 'keydown', (e) => {
      if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey) setInkDebug(!embossUniforms.inkDebug.value)
    }],
  ]
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn)

  // Ink debug view: shows where ink meets the logo, and why it does or doesn't
  // leave a gap there (see the shader). Toggled with the D key, or on from the
  // start with ?debug in the address (for phones).
  let debugLegend = null
  const setInkDebug = (on) => {
    embossUniforms.inkDebug.value = on ? 1 : 0
    if (on && !debugLegend) {
      debugLegend = document.createElement('div')
      Object.assign(debugLegend.style, {
        position: 'fixed',
        left: 'calc(12px + env(safe-area-inset-left, 0px))',
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        zIndex: 1,
        padding: '8px 10px',
        borderRadius: '8px',
        background: 'rgba(255, 255, 255, 0.85)',
        font: '12px/1.5 system-ui, sans-serif',
        color: '#333',
        pointerEvents: 'none',
      })
      const swatch = (css) => `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px;background:${css}"></span>`
      debugLegend.innerHTML = [
        '<b>Ink debug</b> (D to hide)',
        `${swatch('rgb(26,217,64)')}Gap: pen leaving a raised line`,
        `${swatch('rgb(38,89,255)')}No gap: pen coming up to, or along, the line`,
        `${swatch('conic-gradient(red, yellow, lime, cyan, blue, magenta, red)')}Ink: tinted by drawing direction`,
      ].join('<br>')
      container.appendChild(debugLegend)
    } else if (!on && debugLegend) {
      debugLegend.remove()
      debugLegend = null
    }
  }
  if (new URLSearchParams(location.search).has('debug')) setInkDebug(true)

  // Timer pauses while the tab is hidden, so nothing jumps when it comes back.
  // Where a browser's bars don't show the page through them (e.g. Chrome on
  // Android, via theme-color), and anywhere the page shows around the canvas,
  // give them the paper's actual colour at that edge, which shifts as the
  // light moves, by reading the rendered edges back a few times a second.
  const themeMeta = document.querySelector('meta[name="theme-color"]')
  let barsAt = 0
  let barColors = ''
  // (Read back without waiting for the GPU, so it never stalls a frame.)
  let barsReading = false
  const matchBars = () => {
    if (!paper.visible || barsReading || elapsed - barsAt < 0.4) return
    barsAt = elapsed
    barsReading = true
    haze
      .edgeColors()
      .then(({ top, bottom }) => {
        const css = (c) => `rgb(${c.map(Math.round).join(', ')})`
        const next = css(top) + css(bottom)
        if (next === barColors) return
        barColors = next
        document.documentElement.style.backgroundColor = css(bottom)
        themeMeta?.setAttribute('content', css(top))
      })
      .catch(() => {})
      .finally(() => {
        barsReading = false
      })
  }

  const timer = new THREE.Timer()
  timer.connect(document)
  let angle = -Math.PI * 0.75
  let angleVel = 0
  let elapsed = 0
  renderer.setAnimationLoop((now) => {
    timer.update(now)
    const dt = timer.getDelta()
    elapsed += dt
    // On load the logo presses up out of the flat sheet: exponential ease-out,
    // so it rises fast (half way in the first 10%) then slowly settles. Timed
    // from when the paper textures are ready.
    const since = introStart === null ? 0 : elapsed - introStart
    const rise = Math.min(1, Math.max(0, (since - EMBOSS_DELAY) / EMBOSS_DURATION))
    embossUniforms.emboss.value = (1 - 2 ** (-10 * rise)) / (1 - 2 ** -10)

    // Presses sink in quickly, hold while held, then ease back up; dragging
    // drops trail spots behind them, which recover on their own.
    const trail = embossUniforms.pressTrail.value
    const recover = Math.exp(-dt * TRAIL_RECOVER)
    let anyPressed = false
    for (const spot of trail) {
      spot.z *= recover
      if (spot.z > 0.001) anyPressed = true
    }
    for (const p of Object.values(presses)) {
      if (p.pressing && !p.held && p.amount.value > 0.95) p.pressing = false
      if (p.held) p.center.lerp(p.target, 1 - Math.exp(-dt * PRESS_DRAG_FOLLOW))
      const rate = p.pressing ? PRESS_IN_RATE : PRESS_OUT_RATE
      p.amount.value += ((p.pressing ? 1 : 0) - p.amount.value) * (1 - Math.exp(-dt * rate))
      if (p.amount.value > 0.001) anyPressed = true
      if (p.held && p.center.distanceTo(p.lastDrop) > TRAIL_SPACING) {
        let slot = trail[0]
        for (const spot of trail) if (spot.z < slot.z) slot = spot
        slot.set(p.center.x, p.center.y, p.amount.value)
        p.lastDrop.copy(p.center)
      }
    }
    // Let the shader skip the press maths when nothing is pressed.
    embossUniforms.pressActive.value = anyPressed ? 1 : 0

    // The light swings with momentum: a critically damped spring toward the
    // pointer's direction (shortest way round), or easing into a slow idle drift.
    const ldt = Math.min(dt, 0.1)
    let accel
    // Where the light is being steered to, if anywhere: the pointer, or the
    // phone's tilt (x: right edge tipped down, y: top edge tipped up), lit from
    // the edge tipped up (see TILT_LIGHT_FROM_ABOVE).
    let target = null
    if (pointer.active && !(tilt.active && pointer.touch)) target = Math.atan2(pointer.y, pointer.x)
    else if (tilt.active && Math.hypot(tilt.x, tilt.y) > TILT_DEAD_ZONE) {
      const s = TILT_LIGHT_FROM_ABOVE ? -1 : 1
      target = Math.atan2(tilt.y * s, tilt.x * s)
    }
    if (target !== null) {
      const diff = Math.atan2(Math.sin(target - angle), Math.cos(target - angle))
      accel = LIGHT_FOLLOW * LIGHT_FOLLOW * diff - 2 * LIGHT_FOLLOW * angleVel
    } else {
      accel = LIGHT_FOLLOW * (LIGHT_IDLE_SPEED - angleVel)
    }
    angleVel += accel * ldt
    angle += angleVel * ldt
    // World +z is screen-down, so this puts the light on the pointer's side.
    key.position.set(Math.cos(angle) * 6, KEY_HEIGHT, Math.sin(angle) * 6)
    embossUniforms.lightDir.value.set(Math.cos(angle), Math.sin(angle))
    // Clamp so a backgrounded tab doesn't make the dust jump when it resumes.
    dust.update(Math.min(dt, 0.1), elapsed, key.position)
    fog.update(Math.min(dt, 0.1), since, dust.wind)
    uploadPending()
    stepPan(Math.min(dt, 0.25))
    // Ink fades in with the logo as it embosses on load (following the same
    // curve), out while drawing is off, and back in after.
    const inkTarget = drawing ? 1 : 0
    if (inkToggle !== inkTarget) {
      const step = Math.min(dt, 0.25) / INK_TOGGLE_TIME
      inkToggle = inkTarget > inkToggle ? Math.min(1, inkToggle + step) : Math.max(0, inkToggle - step)
    }
    ink.uniforms.inkOpacity.value = inkToggle * embossUniforms.emboss.value
    // The saved intro drawing replays once the logo has finished embossing.
    const afterEmboss = since - EMBOSS_DELAY - EMBOSS_DURATION
    intro.update(introStart !== null && afterEmboss >= 0, afterEmboss)
    live.update()
    ink.setTime(elapsed)
    ink.update(ldt, performance.now())
    ink.flush(renderer)
    haze.render(scene, camera)
    matchBars()
  })

  return Object.assign(dispose, {
    // Pans the view so the sheet (the logo, ink and all) sits `px` CSS px to
    // the right and `py` down from where it rests (0, 0 = back to the middle),
    // easing over PAN_TIME.
    setPan(px, py = 0) {
      if (px === pan.toX && py === pan.toY) return
      Object.assign(pan, { fromX: pan.px, toX: px, fromY: pan.py, toY: py, t: 0 })
    },
    // Where the sheet sits when it isn't panned: `py` CSS px down from the
    // middle of the scene. The scene is taller than the screen on phones (it
    // runs up behind the status bar; see fullBleed.js), so this is how the
    // logo is brought back to the middle of what's on screen.
    setRest(py) {
      if (py === restY) return
      restY = py
      panUniforms()
      fitRemaps()
    },
    // Switches the user's drawing off (the ink fades out; strokes arriving
    // from other people are still laid down, unseen) or back on (it fades
    // back in).
    setDrawing(on) {
      drawing = on
      if (!on) release()
    },
    // How far the view may pan (CSS px), { left, right }; the sheet is rebuilt
    // with more (or less) paper either side if it changes much.
    setPanExtent(e) {
      const next = extent(e)
      const close = (a, b) => Math.abs(a - b) < 12 && a <= b
      if (['left', 'right', 'top', 'bottom'].every((k) => close(next[k], panExtent[k]))) return
      panExtent = next
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(rebuild, 200)
    },
  })

  function dispose() {
    renderer.setAnimationLoop(null)
    timer.dispose()
    tilt.dispose()
    clearTimeout(resizeTimer)
    observer.disconnect()
    for (const [target, type, fn] of listeners) target.removeEventListener(type, fn)
    debugLegend?.remove()
    intro.dispose()
    live.dispose()
    textures.dispose()
    for (const t of pending ?? []) t.dispose()
    dust.dispose()
    ink.dispose()
    haze.dispose()
    paperMat.map?.dispose()
    paperMat.normalMap?.dispose()
    embossUniforms.logoMap.value?.dispose()
    paperMat.dispose()
    paper.geometry.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
