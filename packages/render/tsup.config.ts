import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "projections/index": "src/projections/index.ts",
    "shaders/index": "src/shaders/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "browser",
  external: ["pixi.js", "three"],
  treeshake: true,
  splitting: false,
});
