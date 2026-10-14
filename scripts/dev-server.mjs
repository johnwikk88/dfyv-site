import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { POST as checkoutPost } from "../api/checkout.js";
import { GET as orderGet, POST as orderPost } from "../api/order.js";
import { GET as uploadGet, POST as uploadPost } from "../api/upload.js";
import { POST as webhookPost } from "../api/webhook.js";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const routes = new Map([
  ["POST /api/checkout", checkoutPost],
  ["GET /api/order", orderGet],
  ["POST /api/order", orderPost],
  ["GET /api/upload", uploadGet],
  ["POST /api/upload", uploadPost],
  ["POST /api/webhook", webhookPost],
]);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

async function toRequest(req) {
  const host = req.headers.host || `127.0.0.1:${port}`;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  }
  const method = req.method || "GET";
  return new Request(`http://${host}${req.url}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
}

async function send(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded.replace(/^\/+/, "");
  const filePath = normalize(join(root, relative));
  if (filePath !== root && !filePath.startsWith(root + sep)) return null;
  return filePath;
}

async function readStatic(urlPath) {
  const candidates = [];
  const bare = urlPath.split("?")[0];
  if (bare.endsWith("/")) candidates.push(bare + "index.html");
  else candidates.push(bare);
  if (!extname(bare)) candidates.push(`${bare}.html`);
  for (const candidate of candidates) {
    const filePath = safePath(candidate === "/" ? "/index.html" : candidate);
    if (!filePath) continue;
    try {
      const body = await readFile(filePath);
      return { body, type: types[extname(filePath)] || "application/octet-stream" };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const handler = routes.get(`${req.method} ${url.pathname}`);
    if (handler) {
      await send(res, await handler(await toRequest(req)));
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.end("Method not allowed");
      return;
    }
    const file = await readStatic(url.pathname);
    if (!file) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", file.type);
    res.end(req.method === "HEAD" ? undefined : file.body);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Server error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`DFYV site at http://127.0.0.1:${port}`);
});
