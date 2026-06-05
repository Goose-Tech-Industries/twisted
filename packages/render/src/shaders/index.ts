/**
 * Custom GLSL shaders for Twisted Engine's signature visual identity.
 *
 * These are framework-agnostic GLSL strings. Consumers compose them into
 * Pixi Filter instances at runtime:
 *
 *   import { shaders } from "@twisted/render";
 *   const darknessFilter = new PIXI.Filter({
 *     glProgram: new PIXI.GlProgram({
 *       vertex: shaders.vertex.passthrough,
 *       fragment: shaders.fragment.ambientDarkness,
 *     }),
 *     resources: { darknessUniforms: { darkness: { value: 0.6, type: "f32" } } },
 *   });
 *
 * Separating GLSL from Pixi Filter construction keeps @twisted/render
 * testable and framework-agnostic, and lets non-Pixi backends (Canvas2D,
 * WebGPU-direct) reuse the same shader math.
 *
 * Shader authoring notes:
 *   - GLSL ES 1.00 for WebGL2 compatibility; WebGPU path will use WGSL
 *     equivalents generated from these sources in a future pass.
 *   - Uniforms are prefixed with `u_` by convention.
 *   - Fog of war, ambient darkness, and corruption warp all compose via
 *     stacked Pixi filters on the fog/lighting Container layer.
 */

/** Pass-through vertex shader — used by every 2D screen-space filter. */
const vertexPassthrough = `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(vec2 aPosition) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(vec2 aPosition) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition(aPosition);
  vTextureCoord = filterTextureCoord(aPosition);
}`;

/**
 * Ambient darkness fragment shader.
 * Blends the scene with a flat color at `u_darkness` strength.
 * Preserves player/light sprites by sampling an optional reveal mask.
 */
const fragmentAmbientDarkness = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float u_darkness;
uniform vec3 u_tint;

out vec4 fragColor;

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec3 darkened = mix(c.rgb, u_tint, u_darkness);
  fragColor = vec4(darkened, c.a);
}`;

/**
 * Fog-of-war edge-falloff shader.
 * Applies a radial soft mask around the player so the fog fades smoothly
 * at the reveal radius edge instead of hard-clipping.
 * u_playerScreenPos is the player's screen-space position in pixels.
 * u_revealRadius is the reveal radius in pixels (fogRadius * tileSize).
 */
const fragmentFogOfWar = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;  // w, h, 1/w, 1/h
uniform vec2 u_playerScreenPos;
uniform float u_revealRadius;
uniform float u_outerFadeScale;  // 1.3 = 30% softer edge

out vec4 fragColor;

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec2 pixelPos = vTextureCoord * uInputSize.xy;
  float dist = distance(pixelPos, u_playerScreenPos);
  float reveal = 1.0 - smoothstep(u_revealRadius, u_revealRadius * u_outerFadeScale, dist);
  fragColor = vec4(c.rgb, c.a * reveal);
}`;

/**
 * Blood ogham glow shader.
 * Used on ogham-carved objects, corrupted zones, and ritual sites.
 * Animates a red-amber pulse with noise for organic flicker.
 * u_time is seconds since scene load.
 */
const fragmentOghamGlow = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float u_time;
uniform float u_intensity;

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  float pulse = 0.5 + 0.5 * sin(u_time * 2.0);
  float flicker = 0.9 + 0.1 * hash(vTextureCoord + u_time * 0.1);
  vec3 glow = vec3(0.8, 0.2, 0.1) * pulse * flicker * u_intensity;
  fragColor = vec4(c.rgb + glow * c.a, c.a);
}`;

/**
 * Corruption warp shader.
 * Applies UV-space distortion to make corrupted zones visually warp
 * and shimmer. Stronger corruption = more aggressive warp.
 * u_warpStrength is the max pixel displacement.
 */
const fragmentCorruptionWarp = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float u_time;
uniform float u_warpStrength;

out vec4 fragColor;

void main(void) {
  vec2 uv = vTextureCoord;
  float wave = sin(uv.y * 20.0 + u_time * 3.0) * 0.5
             + cos(uv.x * 15.0 + u_time * 2.0) * 0.5;
  vec2 warped = uv + vec2(wave * u_warpStrength * uInputSize.z, 0.0);
  vec4 c = texture(uTexture, warped);
  // Subtle purple tint on corrupted zones
  fragColor = vec4(c.rgb * vec3(0.9, 0.85, 1.1), c.a);
}`;

/**
 * Celtic knot particle compositing shader.
 * Used by the particle system for signature knot-shaped spell effects.
 * Composites a rotating knot pattern into each particle's quad.
 */
const fragmentCelticKnot = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float u_time;
uniform vec3 u_color;

out vec4 fragColor;

void main(void) {
  vec2 uv = vTextureCoord * 2.0 - 1.0;
  float angle = u_time * 0.5;
  float c = cos(angle), s = sin(angle);
  uv = mat2(c, -s, s, c) * uv;

  // Three-loop knot pattern via distance-to-loops
  float d1 = length(uv - vec2(0.0, 0.3)) - 0.3;
  float d2 = length(uv - vec2(0.26, -0.15)) - 0.3;
  float d3 = length(uv - vec2(-0.26, -0.15)) - 0.3;
  float line = min(abs(d1), min(abs(d2), abs(d3)));
  float knot = smoothstep(0.1, 0.02, line);

  vec4 tex = texture(uTexture, vTextureCoord);
  fragColor = vec4(u_color * knot + tex.rgb * (1.0 - knot), max(knot, tex.a));
}`;

export const shaderSources = {
  vertex: {
    passthrough: vertexPassthrough,
  },
  fragment: {
    ambientDarkness: fragmentAmbientDarkness,
    fogOfWar: fragmentFogOfWar,
    oghamGlow: fragmentOghamGlow,
    corruptionWarp: fragmentCorruptionWarp,
    celticKnot: fragmentCelticKnot,
  },
} as const;

export type ShaderName =
  | "ambientDarkness"
  | "fogOfWar"
  | "oghamGlow"
  | "corruptionWarp"
  | "celticKnot";

/** List of currently registered fragment shader names. */
export function listShaders(): ShaderName[] {
  return Object.keys(shaderSources.fragment) as ShaderName[];
}
