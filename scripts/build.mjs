import { chmod, cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("dist/server", { recursive: true });
await mkdir("dist/native-host", { recursive: true });
await mkdir("dist/firefox-extension", { recursive: true });
await Promise.all(
  [
    "dist/server/index.js",
    "dist/server/index.js.map",
    "dist/native-host/index.js",
    "dist/native-host/index.js.map",
    "dist/firefox-extension/background.js",
    "dist/firefox-extension/background.js.map",
  ].map((path) => rm(path, { force: true })),
);

await build({
  entryPoints: ["mcp-server/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
});

await build({
  entryPoints: ["native-host/index.ts"],
  outfile: "dist/native-host/index.js",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
});

await build({
  entryPoints: ["extension/background.ts"],
  outfile: "dist/firefox-extension/background.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "firefox139",
  sourcemap: true,
});

for (const file of ["manifest.json", "options.html", "options.css", "options.js"]) {
  await cp(`extension/${file}`, `dist/firefox-extension/${file}`);
}
await chmod("dist/server/index.js", 0o755);
await chmod("dist/native-host/index.js", 0o755);
