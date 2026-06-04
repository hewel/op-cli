import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  ...Object.keys(pkg.dependencies ?? {}),
];

export default defineConfig({
  build: {
    target: "node18",
    sourcemap: true,
    minify: false,
    lib: {
      entry: "src/cli.ts",
      formats: ["es"],
      fileName: () => "cli.js",
    },
    rollupOptions: {
      external,
      treeshake: false,
    },
  },
});
