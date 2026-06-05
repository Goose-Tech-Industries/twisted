// src/shaders/index.ts
var vertexPassthrough = `#version 300 es
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
var fragmentAmbientDarkness = `#version 300 es
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
var fragmentFogOfWar = `#version 300 es
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
var fragmentOghamGlow = `#version 300 es
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
var fragmentCorruptionWarp = `#version 300 es
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
var fragmentCelticKnot = `#version 300 es
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
var shaderSources = {
  vertex: {
    passthrough: vertexPassthrough
  },
  fragment: {
    ambientDarkness: fragmentAmbientDarkness,
    fogOfWar: fragmentFogOfWar,
    oghamGlow: fragmentOghamGlow,
    corruptionWarp: fragmentCorruptionWarp,
    celticKnot: fragmentCelticKnot
  }
};
function listShaders() {
  return Object.keys(shaderSources.fragment);
}

export { listShaders, shaderSources };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map