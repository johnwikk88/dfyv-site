import { formatUsd, getPackage } from "../lib/packages.js";
import { json, readJson } from "../lib/http.js";
import {
  UPLOAD_UNAVAILABLE,
  blobConfigured,
  intakePath,
  photoExists,
  readJsonBlob,
  safePhotoPath,
  writeJsonBlob,
} from "../lib/storage.js";
import { isCheckoutSessionId, retrievePaidSession } from "../lib/stripe.js";

const LIMITS = {
  name: 120,
  email: 200,
  businessName: 160,
  notes: 4000,
  photos: 24,
};

function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function publicOrder(session, intake) {
  const packageId = session.metadata?.packageId || "";
  const pkg = getPackage(packageId);
  const line = session.line_items?.data?.[0];
  return {
    paid: true,
    sessionId: session.id,
    packageId,
    packageName: session.metadata?.packageName || line?.description || pkg?.name || "Done For You Visuals package",
    amountLabel: formatUsd(session.amount_total ?? pkg?.amount ?? 0),
    name: intake?.name || session.customer_details?.name || "",
    email: intake?.email || session.customer_details?.email || session.customer_email || "",
    businessName: intake?.businessName || "",
    notes: intake?.notes || "",
    photoCount: Array.isArray(intake?.photos) ? intake.photos.length : 0,
    submitted: Boolean(intake?.submittedAt),
  };
}

async function loadPaid(sessionId) {
  if (!isCheckoutSessionId(sessionId)) {
    return { response: json({ message: "We couldn't find that payment." }, 404) };
  }
  const result = await retrievePaidSession(sessionId);
  if (result.error === "unconfigured") {
    return { response: json({ message: "Checkout coming soon." }, 503) };
  }
  if (result.error === "invalid" || result.error === "missing" || !result.paid) {
    return { response: json({ message: "We couldn't find a completed payment for this link." }, 404) };
  }
  if (result.error) {
    return { response: json({ message: "We couldn't confirm this payment yet. Please refresh in a moment." }, 502) };
  }
  return { session: result.session };
}

export async function GET(request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") || "";
  const loaded = await loadPaid(sessionId);
  if (loaded.response) return loaded.response;
  let intake = null;
  if (blobConfigured()) {
    try {
      intake = await readJsonBlob(intakePath(sessionId));
    } catch (error) {
      console.error("Could not read intake", error?.message || error);
    }
  }
  return json({
    ...publicOrder(loaded.session, intake),
    uploadsEnabled: blobConfigured(),
    uploadMessage: blobConfigured() ? "" : UPLOAD_UNAVAILABLE,
  });
}

export async function POST(request) {
  const body = await readJson(request);
  const sessionId = body?.sessionId || "";
  const loaded = await loadPaid(sessionId);
  if (loaded.response) return loaded.response;
  if (!blobConfigured()) {
    return json({ message: UPLOAD_UNAVAILABLE }, 503);
  }

  const name = clean(body?.name, LIMITS.name);
  const email = clean(body?.email, LIMITS.email);
  const businessName = clean(body?.businessName, LIMITS.businessName);
  const notes = clean(body?.notes, LIMITS.notes);
  if (!name || !email || !businessName) {
    return json({ message: "Name, email, and business name are required." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ message: "Enter a valid email address." }, 400);
  }

  const requested = Array.isArray(body?.photos) ? body.photos : [];
  if (requested.length < 1) {
    return json({ message: "Add at least one photo." }, 400);
  }
  if (requested.length > LIMITS.photos) {
    return json({ message: `Upload up to ${LIMITS.photos} photos.` }, 400);
  }

  const photos = [];
  for (const item of requested) {
    const pathname = safePhotoPath(sessionId, item?.pathname);
    if (!pathname) {
      return json({ message: "A photo didn't match this order. Please upload it again." }, 400);
    }
    const exists = await photoExists(pathname);
    if (!exists) {
      return json({ message: "A photo didn't finish uploading. Please try again." }, 400);
    }
    photos.push({
      pathname,
      contentType: clean(item?.contentType, 80),
      size: Number.isFinite(item?.size) ? item.size : null,
    });
  }

  const intake = {
    sessionId,
    packageId: loaded.session.metadata?.packageId || "",
    name,
    email,
    businessName,
    notes,
    photos,
    submittedAt: new Date().toISOString(),
  };
  try {
    await writeJsonBlob(intakePath(sessionId), intake);
  } catch (error) {
    console.error("Could not save intake", error?.message || error);
    return json({ message: "We couldn't save your photos. Please try again." }, 502);
  }
  return json({ ...publicOrder(loaded.session, intake), uploadsEnabled: true });
}
