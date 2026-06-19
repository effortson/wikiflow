import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import fs from "fs";
import { copyFile } from "fs/promises";

const PDF_WORKER_SRC =
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs";
const PDF_WORKER_OUT = "pdf.worker.min.mjs";

async function copyPdfWorker() {
  await copyFile(PDF_WORKER_SRC, PDF_WORKER_OUT);
}

const banner = `/*
 * EnterpriseFlow
 * MIT License
 */`;

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  alias: {
    "@shared": "./src/shared",
  },
  loader: {
    ".css": "text",
  },
  plugins: [
    {
      name: "css-text",
      setup(build) {
        build.onLoad({ filter: /\.css$/ }, async (args) => {
          const css = await fs.promises.readFile(args.path, "utf8");
          return {
            contents: `export default ${JSON.stringify(css)};`,
            loader: "js",
          };
        });
      },
    },
  ],
});

if (prod) {
  await context.rebuild();
  await copyPdfWorker();
  process.exit(0);
} else {
  await context.rebuild();
  await copyPdfWorker();
  await context.watch();
}
