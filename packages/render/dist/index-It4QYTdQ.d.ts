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
declare const shaderSources: {
    readonly vertex: {
        readonly passthrough: "#version 300 es\nin vec2 aPosition;\nout vec2 vTextureCoord;\n\nuniform vec4 uInputSize;\nuniform vec4 uOutputFrame;\nuniform vec4 uOutputTexture;\n\nvec4 filterVertexPosition(vec2 aPosition) {\n  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;\n  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;\n  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;\n  return vec4(position, 0.0, 1.0);\n}\n\nvec2 filterTextureCoord(vec2 aPosition) {\n  return aPosition * (uOutputFrame.zw * uInputSize.zw);\n}\n\nvoid main(void) {\n  gl_Position = filterVertexPosition(aPosition);\n  vTextureCoord = filterTextureCoord(aPosition);\n}";
    };
    readonly fragment: {
        readonly ambientDarkness: "#version 300 es\nprecision mediump float;\n\nin vec2 vTextureCoord;\nuniform sampler2D uTexture;\nuniform float u_darkness;\nuniform vec3 u_tint;\n\nout vec4 fragColor;\n\nvoid main(void) {\n  vec4 c = texture(uTexture, vTextureCoord);\n  vec3 darkened = mix(c.rgb, u_tint, u_darkness);\n  fragColor = vec4(darkened, c.a);\n}";
        readonly fogOfWar: "#version 300 es\nprecision mediump float;\n\nin vec2 vTextureCoord;\nuniform sampler2D uTexture;\nuniform vec4 uInputSize;  // w, h, 1/w, 1/h\nuniform vec2 u_playerScreenPos;\nuniform float u_revealRadius;\nuniform float u_outerFadeScale;  // 1.3 = 30% softer edge\n\nout vec4 fragColor;\n\nvoid main(void) {\n  vec4 c = texture(uTexture, vTextureCoord);\n  vec2 pixelPos = vTextureCoord * uInputSize.xy;\n  float dist = distance(pixelPos, u_playerScreenPos);\n  float reveal = 1.0 - smoothstep(u_revealRadius, u_revealRadius * u_outerFadeScale, dist);\n  fragColor = vec4(c.rgb, c.a * reveal);\n}";
        readonly oghamGlow: "#version 300 es\nprecision mediump float;\n\nin vec2 vTextureCoord;\nuniform sampler2D uTexture;\nuniform float u_time;\nuniform float u_intensity;\n\nout vec4 fragColor;\n\nfloat hash(vec2 p) {\n  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);\n}\n\nvoid main(void) {\n  vec4 c = texture(uTexture, vTextureCoord);\n  float pulse = 0.5 + 0.5 * sin(u_time * 2.0);\n  float flicker = 0.9 + 0.1 * hash(vTextureCoord + u_time * 0.1);\n  vec3 glow = vec3(0.8, 0.2, 0.1) * pulse * flicker * u_intensity;\n  fragColor = vec4(c.rgb + glow * c.a, c.a);\n}";
        readonly corruptionWarp: "#version 300 es\nprecision mediump float;\n\nin vec2 vTextureCoord;\nuniform sampler2D uTexture;\nuniform vec4 uInputSize;\nuniform float u_time;\nuniform float u_warpStrength;\n\nout vec4 fragColor;\n\nvoid main(void) {\n  vec2 uv = vTextureCoord;\n  float wave = sin(uv.y * 20.0 + u_time * 3.0) * 0.5\n             + cos(uv.x * 15.0 + u_time * 2.0) * 0.5;\n  vec2 warped = uv + vec2(wave * u_warpStrength * uInputSize.z, 0.0);\n  vec4 c = texture(uTexture, warped);\n  // Subtle purple tint on corrupted zones\n  fragColor = vec4(c.rgb * vec3(0.9, 0.85, 1.1), c.a);\n}";
        readonly celticKnot: "#version 300 es\nprecision mediump float;\n\nin vec2 vTextureCoord;\nuniform sampler2D uTexture;\nuniform float u_time;\nuniform vec3 u_color;\n\nout vec4 fragColor;\n\nvoid main(void) {\n  vec2 uv = vTextureCoord * 2.0 - 1.0;\n  float angle = u_time * 0.5;\n  float c = cos(angle), s = sin(angle);\n  uv = mat2(c, -s, s, c) * uv;\n\n  // Three-loop knot pattern via distance-to-loops\n  float d1 = length(uv - vec2(0.0, 0.3)) - 0.3;\n  float d2 = length(uv - vec2(0.26, -0.15)) - 0.3;\n  float d3 = length(uv - vec2(-0.26, -0.15)) - 0.3;\n  float line = min(abs(d1), min(abs(d2), abs(d3)));\n  float knot = smoothstep(0.1, 0.02, line);\n\n  vec4 tex = texture(uTexture, vTextureCoord);\n  fragColor = vec4(u_color * knot + tex.rgb * (1.0 - knot), max(knot, tex.a));\n}";
    };
};
type ShaderName = "ambientDarkness" | "fogOfWar" | "oghamGlow" | "corruptionWarp" | "celticKnot";
/** List of currently registered fragment shader names. */
declare function listShaders(): ShaderName[];

type index_ShaderName = ShaderName;
declare const index_listShaders: typeof listShaders;
declare const index_shaderSources: typeof shaderSources;
declare namespace index {
  export { type index_ShaderName as ShaderName, index_listShaders as listShaders, index_shaderSources as shaderSources };
}

export { type ShaderName as S, index as i, listShaders as l, shaderSources as s };
