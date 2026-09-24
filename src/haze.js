import * as THREE from 'three'

// Hazy finish over the whole scene, like light diffusing through tracing paper:
// a Gaussian blur of the scene mixed back over the sharp render, with a faint
// white wash. Same look as a CSS backdrop-filter overlay, but done in WebGL at a
// fraction of the resolution, which is far cheaper (especially in Safari).
//
// The scene renders into an offscreen target in display (sRGB) values, as it
// would to the screen, so blurring and mixing match the CSS version exactly.

const fullscreenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Box-averages the sharp scene down to the blur resolution.
const downsampleFragment = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 offset;
  varying vec2 vUv;
  void main() {
    gl_FragColor = 0.25 * (
      texture2D(tSrc, vUv + vec2(-offset.x, -offset.y)) +
      texture2D(tSrc, vUv + vec2( offset.x, -offset.y)) +
      texture2D(tSrc, vUv + vec2(-offset.x,  offset.y)) +
      texture2D(tSrc, vUv + vec2( offset.x,  offset.y)));
  }
`

// One direction of a separable Gaussian, using bilinear filtering so each tap
// covers two texels.
const TAPS = 8
const blurFragment = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 dir;
  uniform float offsets[${TAPS + 1}];
  uniform float weights[${TAPS + 1}];
  varying vec2 vUv;
  void main() {
    vec4 sum = texture2D(tSrc, vUv) * weights[0];
    for (int i = 1; i <= ${TAPS}; i++) {
      vec2 o = dir * offsets[i];
      sum += (texture2D(tSrc, vUv + o) + texture2D(tSrc, vUv - o)) * weights[i];
    }
    gl_FragColor = sum;
  }
`

// The haze is lighter where the mask (optional; e.g. ink laid on the paper)
// covers the screen: the mask's alpha, read at the remapped UV, fades the haze
// to `maskKeep` of its strength. A second, optional mask (the logo's height)
// holds that back where no ink shows anyway, so a stroke crossing the raised
// logo leaves no ghost of itself on it.
const compositeFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBlur;
  uniform float amount;
  uniform float tint;
  uniform sampler2D tMask;
  uniform vec4 maskRemap;
  uniform float maskOn;
  uniform float maskKeep;
  uniform sampler2D tHold;
  uniform vec4 holdRemap;
  uniform float holdOn;
  uniform vec2 holdRange;
  varying vec2 vUv;
  void main() {
    vec3 sharp = texture2D(tScene, vUv).rgb;
    vec3 soft = mix(texture2D(tBlur, vUv).rgb, vec3(1.0), tint);
    float amt = amount;
    if (maskOn > 0.0) {
      vec2 mUv = vUv * maskRemap.xy + maskRemap.zw;
      if (all(greaterThanEqual(mUv, vec2(0.0))) && all(lessThanEqual(mUv, vec2(1.0)))) {
        float m = texture2D(tMask, mUv).a * maskOn;
        if (holdOn > 0.0) {
          vec2 hUv = vUv * holdRemap.xy + holdRemap.zw;
          float h = texture2D(tHold, hUv).b * holdOn;
          m *= 1.0 - smoothstep(holdRange.x, holdRange.y, h);
        }
        amt *= mix(1.0, maskKeep, m);
      }
    }
    gl_FragColor = vec4(mix(sharp, soft, amt), 1.0);
  }
`

// Gaussian with standard deviation sigma (in texels), folded into bilinear taps.
function gaussianTaps(sigma) {
  const radius = TAPS * 2
  const w = []
  let total = 0
  for (let i = 0; i <= radius; i++) {
    w[i] = Math.exp(-(i * i) / (2 * sigma * sigma))
    total += i ? 2 * w[i] : w[i]
  }
  const offsets = [0]
  const weights = [w[0] / total]
  for (let i = 1; i <= radius; i += 2) {
    const a = w[i]
    const b = w[i + 1] ?? 0
    offsets.push((i * a + (i + 1) * b) / (a + b))
    weights.push((a + b) / total)
  }
  return { offsets, weights }
}

// blur: CSS px (standard deviation, like CSS blur()); amount: 0–1 mix of the
// blurred scene; tint: 0–1 white wash over the blurred scene.
export function createHaze(renderer, { blur, amount, tint }) {
  const targetOptions = {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  }
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions)
  const blurA = new THREE.WebGLRenderTarget(1, 1, targetOptions)
  const blurB = new THREE.WebGLRenderTarget(1, 1, targetOptions)

  // One triangle covering the screen.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  const pass = (fragmentShader, uniforms) =>
    new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false })
  const downsample = pass(downsampleFragment, { tSrc: { value: sceneTarget.texture }, offset: { value: new THREE.Vector2() } })
  const blurPass = pass(blurFragment, {
    tSrc: { value: null },
    dir: { value: new THREE.Vector2() },
    offsets: { value: [] },
    weights: { value: [] },
  })
  const composite = pass(compositeFragment, {
    tScene: { value: sceneTarget.texture },
    tBlur: { value: blurA.texture },
    amount: { value: amount },
    tint: { value: tint },
    tMask: { value: null },
    maskRemap: { value: new THREE.Vector4(1, 1, 0, 0) },
    maskOn: { value: 0 },
    maskKeep: { value: 1 },
    tHold: { value: null },
    holdRemap: { value: new THREE.Vector4(1, 1, 0, 0) },
    holdOn: { value: 0 },
    holdRange: { value: new THREE.Vector2(0, 1) },
  })
  const quad = new THREE.Mesh(geometry, downsample)
  quad.frustumCulled = false
  const quadScene = new THREE.Scene()
  quadScene.add(quad)
  const quadCamera = new THREE.Camera()

  const draw = (material, target) => {
    quad.material = material
    renderer.setRenderTarget(target)
    renderer.render(quadScene, quadCamera)
  }

  return {
    // The scene is drawn here first; shaders must be compiled against it.
    target: sceneTarget,

    // Lightens the haze under a mask: texture (its alpha), remap (Vector4 from
    // screen UV to the mask's UV, kept live), strength (a uniform-like object
    // whose value scales the mask, 0–1, kept live) and keep (how much haze is
    // left under full mask).
    setMask(texture, remap, strength, keep) {
      const u = composite.uniforms
      u.tMask.value = texture
      u.maskRemap.value = remap
      u.maskOn = strength
      u.maskKeep.value = keep
    },

    // Holds the mask back where a height map is high: texture (a uniform-like
    // object holding it, kept live, its blue channel the height), remap
    // (screen UV → its UV, kept live), strength (a uniform-like object scaling
    // the height, kept live) and range (the heights it fades out over).
    setMaskHold(texture, remap, strength, [from, to]) {
      const u = composite.uniforms
      u.tHold = texture
      u.holdRemap.value = remap
      u.holdOn = strength
      u.holdRange.value.set(from, to)
    },

    // cssW/cssH: canvas size in CSS px; dpr: the renderer's pixel ratio.
    setSize(cssW, cssH, dpr) {
      const w = Math.max(1, Math.round(cssW * dpr))
      const h = Math.max(1, Math.round(cssH * dpr))
      sceneTarget.setSize(w, h)
      // Blur at 1/(2·dpr) resolution, where the blur is always 1/2 of `blur` texels.
      const down = Math.max(1, 2 * dpr)
      const bw = Math.max(1, Math.ceil(w / down))
      const bh = Math.max(1, Math.ceil(h / down))
      blurA.setSize(bw, bh)
      blurB.setSize(bw, bh)
      downsample.uniforms.offset.value.set((0.25 * down) / w, (0.25 * down) / h)
      const { offsets, weights } = gaussianTaps((blur * dpr) / down)
      blurPass.uniforms.offsets.value = offsets
      blurPass.uniforms.weights.value = weights
      this.texel = [1 / bw, 1 / bh]
    },

    render(scene, camera) {
      renderer.setRenderTarget(sceneTarget)
      renderer.render(scene, camera)
      if (amount <= 0) {
        composite.uniforms.amount.value = 0
        draw(composite, null)
        return
      }
      draw(downsample, blurA)
      blurPass.uniforms.tSrc.value = blurA.texture
      blurPass.uniforms.dir.value.set(this.texel[0], 0)
      draw(blurPass, blurB)
      blurPass.uniforms.tSrc.value = blurB.texture
      blurPass.uniforms.dir.value.set(0, this.texel[1])
      draw(blurPass, blurA)
      draw(composite, null)
    },

    // The average colour (display RGB, 0–255) along the top and bottom edges of
    // the last frame, from the small blurred copy (so it's cheap to read back),
    // with the haze's own wash applied as the composite does. Resolves once
    // the GPU has the pixels ready, without stalling it.
    async edgeColors() {
      const w = blurA.width
      const rows = [blurA.height - 1, 0].map((y) =>
        renderer.readRenderTargetPixelsAsync(blurA, 0, y, w, 1, new Uint8Array(w * 4)),
      )
      const [topRow, bottomRow] = await Promise.all(rows)
      const average = (row) => {
        const c = [0, 0, 0]
        for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) c[k] += row[x * 4 + k]
        return c.map((v) => {
          v /= w
          return v + (v + (255 - v) * tint - v) * amount
        })
      }
      // Render targets run bottom-up.
      return { top: average(topRow), bottom: average(bottomRow) }
    },

    dispose() {
      for (const t of [sceneTarget, blurA, blurB]) t.dispose()
      for (const m of [downsample, blurPass, composite]) m.dispose()
      geometry.dispose()
    },
  }
}
