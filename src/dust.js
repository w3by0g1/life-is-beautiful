import * as THREE from 'three'

// Out-of-focus dust motes drifting above the paper that slowly settle onto it.
// World layout matches paperScene: the paper lies on y = 0, spanning
// x ∈ [-aspect, aspect] and z ∈ [-1, 1], viewed from straight above.

const COUNT = 20
// Once more than this many motes have landed, the oldest fade out and respawn,
// so some dust is always drifting.
const MAX_LANDED = Math.round(COUNT * 0.4)
// Height of the air layer the dust floats in (world units above the paper).
const CEILING = 0.35
// Sinking speed, in world units per second.
const SINK = 0.012
// Room air: every WIND_SHIFT_MIN–MAX seconds the breeze picks a new direction and
// speed (up to WIND_MAX, mostly gentle) and turns toward it at rate WIND_TURN.
const WIND_MAX = 0.07
const WIND_SHIFT_MIN = 5
const WIND_SHIFT_MAX = 17
const WIND_TURN = 0.35
// Some shifts arrive with a gust: a burst of extra speed and turbulence along the
// breeze that dies away over a couple of seconds, lifting motes as it passes and
// occasionally picking landed dust back up off the paper.
const GUST_CHANCE = 0.3
const GUST_SPEED = 0.14
const GUST_LIFT = 0.03
const GUST_PICKUP = 0.25
// Dust colours (sRGB): warm where a mote is near the key light and catches it,
// cooler grey on the far side of the paper.
const DUST_LIT = new THREE.Color(0xc4b59e)
const DUST_SHADE = new THREE.Color(0x9a9fa6)
// Distances from the light (it circles at radius 6) that map to fully lit and fully shaded.
const LIT_NEAR = 4.6
const LIT_FAR = 7.4
// Blob diameter in CSS pixels on the paper and at the ceiling; motes nearer
// the camera are further out of focus, so they spread wider and fainter.
const SIZE_LANDED = 7
const SIZE_HIGH = 30

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uPixelRatio;
  uniform vec3 uLightPos;
  uniform float uLitNear;
  uniform float uLitFar;
  varying float vAlpha;
  varying float vLit;
  void main() {
    vAlpha = aAlpha;
    float d = distance(position.xz, uLightPos.xz);
    vLit = smoothstep(uLitFar, uLitNear, d);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
  }
`

// Gaussian falloff with no hard edge, like a defocused speck.
const fragmentShader = /* glsl */ `
  uniform vec3 uLitColor;
  uniform vec3 uShadeColor;
  varying float vAlpha;
  varying float vLit;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.85, 1.0, r));
    if (a <= 0.002) discard;
    gl_FragColor = vec4(mix(uShadeColor, uLitColor, vLit), a * vAlpha);
  }
`

export function createDust(scene, pixelRatio) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(COUNT), 1))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(COUNT), 1))
  for (const a of Object.values(geometry.attributes)) a.setUsage(THREE.DynamicDrawUsage)

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uLitColor: { value: DUST_LIT },
      uShadeColor: { value: DUST_SHADE },
      uLightPos: { value: new THREE.Vector3() },
      uLitNear: { value: LIT_NEAR },
      uLitFar: { value: LIT_FAR },
      uPixelRatio: { value: pixelRatio },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const motes = new THREE.Points(geometry, material)
  motes.frustumCulled = false
  motes.renderOrder = 1
  scene.add(motes)

  // Per-mote simulation state.
  const pos = new Float32Array(COUNT * 3)
  const seed = new Float32Array(COUNT)
  const landedAt = new Float32Array(COUNT).fill(-1) // -1 while airborne
  const fadeFrom = new Float32Array(COUNT).fill(-1) // -1 unless being recycled
  const bornAt = new Float32Array(COUNT)
  const vel = new Float32Array(COUNT * 2) // horizontal velocity, lags the air
  let aspect = 1

  // Shared room air.
  const air = { x: 0.035, z: 0.012, tx: 0.035, tz: 0.012, gust: 0, next: 4 + Math.random() * 6 }

  const spawn = (i, t, anyHeight) => {
    pos[i * 3] = (Math.random() * 2 - 1) * (aspect + 0.2)
    pos[i * 3 + 1] = CEILING * (anyHeight ? 0.05 + Math.random() * 0.95 : 0.5 + Math.random() * 0.5)
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * 1.2
    seed[i] = Math.random()
    landedAt[i] = -1
    fadeFrom[i] = -1
    bornAt[i] = t
    vel[i * 2] = air.x
    vel[i * 2 + 1] = air.z
  }
  for (let i = 0; i < COUNT; i++) spawn(i, -10, true)

  const wrap = (v, lim) => (v > lim ? v - 2 * lim : v < -lim ? v + 2 * lim : v)

  // lightPos: world position of the key light, which tints the motes.
  const update = (dt, t, lightPos) => {
    material.uniforms.uLightPos.value.copy(lightPos)
    const limX = aspect + 0.2
    let landedCount = 0
    let oldest = -1
    for (let i = 0; i < COUNT; i++) {
      if (landedAt[i] >= 0 && fadeFrom[i] < 0) {
        landedCount++
        if (oldest < 0 || landedAt[i] < landedAt[oldest]) oldest = i
      }
    }
    if (landedCount > MAX_LANDED && oldest >= 0) fadeFrom[oldest] = t

    // Occasionally the breeze shifts, sometimes with a gust.
    if (t >= air.next) {
      const ang = Math.random() * Math.PI * 2
      const speed = WIND_MAX * Math.random() ** 1.5
      air.tx = Math.cos(ang) * speed
      air.tz = Math.sin(ang) * speed
      if (Math.random() < GUST_CHANCE) air.gust = 0.6 + Math.random() * 0.4
      air.next = t + WIND_SHIFT_MIN + Math.random() * (WIND_SHIFT_MAX - WIND_SHIFT_MIN)
    }
    const turn = 1 - Math.exp(-dt * WIND_TURN)
    air.x += (air.tx - air.x) * turn
    air.z += (air.tz - air.z) * turn
    air.gust *= Math.exp(-dt * 0.7)
    const airSpeed = Math.hypot(air.x, air.z) || 1
    const gx = air.x / airSpeed
    const gz = air.z / airSpeed

    const attrs = geometry.attributes
    for (let i = 0; i < COUNT; i++) {
      const s = seed[i]
      let x = pos[i * 3]
      let y = pos[i * 3 + 1]
      let z = pos[i * 3 + 2]

      // Gusts are patchy rather than uniform across the page.
      const g = air.gust * (0.6 + 0.4 * Math.sin(x * 2.1 + z * 1.7 + t * 0.9))

      // A strong gust can lift landed dust back off the paper.
      if (landedAt[i] >= 0 && fadeFrom[i] < 0 && g > 0.4 && Math.random() < dt * GUST_PICKUP * g) {
        landedAt[i] = -1
        vel[i * 2] = 0
        vel[i * 2 + 1] = 0
        y = 0.002
      }

      if (landedAt[i] < 0) {
        // Local air: the room breeze, the gust along it, and small eddies that
        // get more turbulent while a gust is blowing.
        const ax =
          air.x + gx * GUST_SPEED * g + 0.03 * Math.sin(t * 0.3 + z * 3 + s * 20) + g * 0.04 * Math.sin(t * 3 + s * 50)
        const az =
          air.z + gz * GUST_SPEED * g + 0.03 * Math.cos(t * 0.27 + x * 2.5 + s * 31) + g * 0.04 * Math.cos(t * 2.6 + s * 70)
        // Motes have inertia; lighter ones (low seed) follow the air faster.
        const follow = 1 - Math.exp(-dt * (1.8 - s * 1.2))
        vel[i * 2] += (ax - vel[i * 2]) * follow
        vel[i * 2 + 1] += (az - vel[i * 2 + 1]) * follow
        x += vel[i * 2] * dt
        z += vel[i * 2 + 1] * dt
        const lift = GUST_LIFT * g * (1 - s * 0.6)
        y += (-SINK * (0.5 + s) + 0.01 * Math.sin(t * 0.8 + s * 40) + lift) * dt
        y = Math.min(y, CEILING)
        x = wrap(x, limX)
        z = wrap(z, 1.2)
        if (y <= 0) {
          y = 0
          landedAt[i] = t
        }
        pos[i * 3] = x
        pos[i * 3 + 1] = y
        pos[i * 3 + 2] = z
      }

      let fade = Math.min(1, (t - bornAt[i]) / 2)
      if (fadeFrom[i] >= 0) {
        fade = 1 - (t - fadeFrom[i]) / 2.5
        if (fade <= 0) {
          spawn(i, t, false)
          fade = 0
        }
      }

      // f: 0 on the paper, 1 at the ceiling (closest to the camera).
      const f = Math.min(1, y / CEILING)
      const grain = 0.7 + s * 0.6
      attrs.position.setXYZ(i, x, 0.001 + y, z)
      attrs.aSize.setX(i, (SIZE_LANDED + (SIZE_HIGH - SIZE_LANDED) * f * f) * grain)
      attrs.aAlpha.setX(i, (0.45 - 0.33 * f) * fade)
    }
    attrs.position.needsUpdate = true
    attrs.aSize.needsUpdate = true
    attrs.aAlpha.needsUpdate = true
  }

  return {
    update,
    // Current room air velocity, for anything else that should drift with it.
    wind: air,
    setAspect(a) {
      aspect = a
    },
    dispose() {
      scene.remove(motes)
      geometry.dispose()
      material.dispose()
    },
  }
}
