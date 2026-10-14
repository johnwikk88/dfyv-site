import { get, head, put } from "@vercel/blob";

export const CHECKOUT_COMING_SOON = "Checkout coming soon.";
export const UPLOAD_UNAVAILABLE =
  "Photo upload isn't connected yet. Your payment still went through. Message @John_b_designs with your order reference and your photos.";

export function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export function blobAccess() {
  return process.env.BLOB_ACCESS === "public" ? "public" : "private";
}

export function orderPrefix(sessionId) {
  return `orders/${sessionId}/`;
}

export function intakePath(sessionId) {
  return `${orderPrefix(sessionId)}intake.json`;
}

export function paidPath(sessionId) {
  return `${orderPrefix(sessionId)}paid.json`;
}

export function safePhotoPath(sessionId, pathname) {
  if (typeof pathname !== "string") return null;
  if (!pathname.startsWith(orderPrefix(sessionId))) return null;
  if (pathname.includes("..") || pathname.includes("\\")) return null;
  if (pathname.endsWith("/intake.json") || pathname.endsWith("/paid.json")) return null;
  return pathname;
}

export async function writeJsonBlob(pathname, value) {
  await put(pathname, JSON.stringify(value), {
    access: blobAccess(),
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function readJsonBlob(pathname) {
  try {
    const result = await get(pathname, { access: blobAccess(), useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    if (error?.statusCode === 404 || /not found/i.test(String(error?.message || ""))) return null;
    throw error;
  }
}

export async function photoExists(pathname) {
  try {
    const result = await head(pathname);
    return Boolean(result && result.pathname);
  } catch {
    return false;
  }
}
