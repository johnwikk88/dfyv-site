import { build } from "esbuild";
import { spawn } from "node:child_process";

await build({
  entryPoints: ["client/success.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  outfile: "checkout-success.js",
  minify: true,
  legalComments: "none",
  target: ["es2020"],
});

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/test.mjs"], { stdio: "inherit" });
  child.on("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`tests exited with ${code}`));
  });
});
