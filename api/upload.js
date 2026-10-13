import { handleUpload } from "@vercel/blob/client";
import { json, readJson } from "../lib/http.js";
import { UPLOAD_UNAVAILABLE, blobAccess, blobConfigured, orderPrefix } from "../lib/storage.js";
import { isCheckoutSessionId, retrievePaidSession } from "../lib/stripe.js";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

const MAX_BYTES = 20 * 1024 * 1024;

export async function GET() {
  return json({
    enabled: blobConfigured(),
    access: blobAccess(),
    message: blobConfigured() ? "" : UPLOAD_UNAVAILABLE,
  });
}

export async function POST(request) {
  if (!blobConfigured()) {
    return json({ message: UPLOAD_UNAVAILABLE }, 503);
  }
  const body = await readJson(request);
  if (!body) {
    return json({ message: "Upload request was empty." }, 400);
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload = {};
        try {
          payload = JSON.parse(clientPayload || "{}");
        } catch {
          payload = {};
        }
        const sessionId = payload.sessionId;
        if (!isCheckoutSessionId(sessionId) || !pathname.startsWith(orderPrefix(sessionId))) {
          throw new Error("This upload isn't tied to a paid order.");
        }
        const paid = await retrievePaidSession(sessionId);
        if (!paid.paid) {
          throw new Error("This upload isn't tied to a paid order.");
        }
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ sessionId }),
        };
      },
    });
    return json(result);
  } catch (error) {
    console.error("Upload token failed", error?.message || error);
    return json({ message: error?.message || "Upload could not start." }, 400);
  }
}
