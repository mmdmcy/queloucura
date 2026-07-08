import { mkdir, rm, copyFile } from "node:fs/promises";
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/client/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  outdir: "dist/client/assets",
  entryNames: "main",
  assetNames: "[name]",
  logLevel: "info",
  loader: {
    ".css": "css"
  }
};

async function prepareClientDirectory() {
  await rm("dist/client", { recursive: true, force: true });
  await mkdir("dist/client/assets", { recursive: true });
  await copyFile("index.html", "dist/client/index.html");
}

await prepareClientDirectory();

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Client bundle watching dist/client/assets");
  await new Promise(() => {});
} else {
  await build(options);
}
