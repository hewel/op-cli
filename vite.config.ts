import { chmodSync } from "node:fs";
import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  ...Object.keys(pkg.dependencies ?? {}),
];


const executableCliPlugin = {
  name: "executable-cli",
  writeBundle(): void {
    chmodSync("dist/cli.js", 0o755);
  },
};

export default defineConfig({
  plugins: [executableCliPlugin],
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
