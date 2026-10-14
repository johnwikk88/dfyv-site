import { build } from "esbuild";
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const skipDirs = new Set(["api", "lib", "scripts", "client", "node_modules", "public", ".git", ".vercel"]);
const staticExt = new Set([".html", ".css", ".js", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".ico", ".svg", ".txt", ".xml"]);

async function publishStatic() {
  const root = process.cwd();
  const out = path.join(root, "public");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const from = path.join(root, entry.name);
    const to = path.join(out, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      await cp(from, to, { recursive: true });
      continue;
    }
    if (!staticExt.has(path.extname(entry.name).toLowerCase())) continue;
    await cp(from, to);
  }
  await stat(path.join(out, "index.html"));
  await stat(path.join(out, "checkout.js"));
  await stat(path.join(out, "checkout-success.js"));
  await stat(path.join(out, "checkout", "success.html"));
  try {
    await stat(path.join(out, "api"));
    throw new Error("api routes must stay outside public so Vercel serves them as functions");
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
}

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

await publishStatic();
