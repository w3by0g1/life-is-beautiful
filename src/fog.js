import * as THREE from 'three'

// A thin layer of cloudy fog hovering over the paper, drifting with the room air.
// It's computed inside the paper's shader (see paperScene.js) and mixed over the
// lit paper, rather than drawn as its own full-screen layer, to save a pass.
// World layout matches paperScene: the paper lies on y = 0 spanning
// x ∈ [-aspect, aspect] and z ∈ [-1, 1], viewed from straight above.

// Overall fog density and its tint (sRGB).
const FOG_AMOUNT = 0.07
const FOG_COLOR = new THREE.Color(0xd7dbe0)
// Fade-in on load, in seconds.
const FADE_IN = 2.5

// GLSL for the paper shader: uniforms, noise, and fogDensity(p) for a world
// position p (x, z).
export const FOG_GLSL = /* glsl */ `
  uniform float fogTime;
  uniform vec2 fogDrift;
  uniform float fogAmount;
  uniform float fogIntro;
  uniform vec3 fogColor;

  float fogHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fogNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(fogHash(i), fogHash(i + vec2(1.0, 0.0)), f.x),
      mix(fogHash(i + vec2(0.0, 1.0)), fogHash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fogFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * fogNoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
  // 0–1 opacity of the fog at world position p.
  float fogDensity(vec2 p) {
    float fog = fogFbm(p * 1.3 + fogDrift + vec2(fogTime * 0.01, 0.0));
    return fogAmount * clamp(0.2 + fog * 1.1, 0.0, 1.0) * fogIntro;
  }
`

export function createFog() {
  const uniforms = {
    fogTime: { value: 0 },
    fogDrift: { value: new THREE.Vector2() },
    fogAmount: { value: FOG_AMOUNT },
    fogIntro: { value: 0 },
    fogColor: { value: FOG_COLOR },
  }
  return {
    uniforms,
    // wind: current room air velocity (world units/s); the fog moves with the
    // air at the same speed as the dust. 1.3 is the fog's noise scale.
    update(dt, t, wind) {
      uniforms.fogTime.value = t
      uniforms.fogIntro.value = Math.min(1, t / FADE_IN)
      uniforms.fogDrift.value.x -= wind.x * dt * 1.3
      uniforms.fogDrift.value.y -= wind.z * dt * 1.3
    },
  }
}
