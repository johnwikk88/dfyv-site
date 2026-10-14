import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { POST as checkoutPost } from "../api/checkout.js";
import { GET as orderGet, POST as orderPost } from "../api/order.js";
import { GET as uploadGet, POST as uploadPost } from "../api/upload.js";
import { POST as webhookPost } from "../api/webhook.js";
import { PACKAGES, STATEMENT_DESCRIPTOR, formatUsd } from "../lib/packages.js";
import { createCheckoutSession } from "../lib/stripe.js";
import { safePhotoPath } from "../lib/storage.js";

const saved = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  BLOB_STORE_ID: process.env.BLOB_STORE_ID,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearPayments() {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
}

async function call(handler, { method = "POST", path = "/", body, headers } = {}) {
  const request = new Request(`http://127.0.0.1${path}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const response = await handler(request);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

clearPayments();

assert.equal(STATEMENT_DESCRIPTOR, "DONEFORYOUVISUALS");
assert.ok(STATEMENT_DESCRIPTOR.length <= 22);
assert.deepEqual(
  Object.values(PACKAGES).map((pkg) => [pkg.name, pkg.amount]),
  [
    ["Local Starter", 29700],
    ["Tier 1 — Visuals Only", 49700],
    ["Tier 2 — Visuals + Content", 99700],
    ["Tier 3 — Full Campaign", 199700],
  ],
);
assert.equal(formatUsd(29700), "$297");

const missingPackage = await call(checkoutPost, { body: { packageId: "retainer" } });
assert.equal(missingPackage.status, 400);

const comingSoon = await call(checkoutPost, { body: { packageId: "local-starter" } });
assert.equal(comingSoon.status, 503);
assert.equal(comingSoon.data.message, "Checkout coming soon.");

const tierSoon = await call(checkoutPost, { body: { packageId: "tier-3" } });
assert.equal(tierSoon.status, 503);
assert.equal(tierSoon.data.message, "Checkout coming soon.");

const badOrder = await call(orderGet, { method: "GET", path: "/api/order?session_id=nope" });
assert.equal(badOrder.status, 404);

const unpaidOrder = await call(orderPost, {
  body: { sessionId: "cs_test_abc", name: "A", email: "a@b.co", businessName: "B", photos: [] },
});
assert.equal(unpaidOrder.status, 503);
assert.equal(unpaidOrder.data.message, "Checkout coming soon.");

const uploadStatus = await call(uploadGet, { method: "GET", path: "/api/upload" });
assert.equal(uploadStatus.status, 200);
assert.equal(uploadStatus.data.enabled, false);
assert.equal(uploadStatus.data.access, "private");

const uploadBlocked = await call(uploadPost, { body: { type: "blob.generate-client-token" } });
assert.equal(uploadBlocked.status, 503);
assert.match(uploadBlocked.data.message, /Photo upload isn't connected yet/);

const webhookMissing = await call(webhookPost, { body: "{}" });
assert.equal(webhookMissing.status, 503);
assert.equal(webhookMissing.data.message, "Checkout coming soon.");

assert.equal(safePhotoPath("cs_test_abc", "orders/cs_test_abc/photo.jpg"), "orders/cs_test_abc/photo.jpg");
assert.equal(safePhotoPath("cs_test_abc", "orders/cs_test_other/photo.jpg"), null);
assert.equal(safePhotoPath("cs_test_abc", "orders/cs_test_abc/../secret.jpg"), null);
assert.equal(safePhotoPath("cs_test_abc", "orders/cs_test_abc/intake.json"), null);

const pages = ["index.html", "next-steps.html", "tier-1.html", "tier-2.html", "tier-3.html"];
const html = await Promise.all(pages.map((page) => readFile(page, "utf8")));
for (const id of ["local-starter", "tier-1", "tier-2", "tier-3"]) {
  assert.ok(html.some((page) => page.includes(`data-package="${id}"`)), id);
}
assert.ok(html[0].includes("Local Starter"));
assert.ok(html[0].includes("Tier 1 — Visuals Only"));
assert.ok(html[0].includes("Tier 2 — Visuals + Content"));
assert.ok(html[0].includes("Tier 3 — Full Campaign"));
const success = await readFile("checkout/success.html", "utf8");
const cancel = await readFile("checkout/cancel.html", "utf8");
assert.match(success, /Thank you/);
assert.match(success, /name="businessName"/);
assert.match(cancel, /Back to pricing/);
assert.match(cancel, /next-steps\.html/);
const bundle = await readFile("checkout-success.js", "utf8");
assert.match(bundle, /handleUploadUrl|\/api\/upload/);

let attempts = 0;
const fakeStripe = {
  checkout: {
    sessions: {
      async create(params) {
        attempts += 1;
        if (params.payment_intent_data.statement_descriptor_suffix) {
          const error = new Error("combined statement descriptor is too long");
          error.param = "payment_intent_data[statement_descriptor_suffix]";
          throw error;
        }
        return { id: "cs_test_fake", url: "https://checkout.stripe.com/c/pay/cs_test_fake" };
      },
    },
  },
};
const session = await createCheckoutSession(fakeStripe, {
  mode: "payment",
  metadata: { packageId: "tier-1" },
  success_url: "https://example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  cancel_url: "https://example.com/checkout/cancel",
});
assert.equal(attempts, 2);
assert.equal(session.url, "https://checkout.stripe.com/c/pay/cs_test_fake");

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const payload = JSON.stringify({
  id: "evt_test_webhook",
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_test" } },
});
const signature = stripe.webhooks.generateTestHeaderString({
  payload,
  secret: process.env.STRIPE_WEBHOOK_SECRET,
});
const badSig = await call(webhookPost, {
  body: payload,
  headers: { "stripe-signature": "t=1,v1=bad" },
});
assert.equal(badSig.status, 400);
const ignored = await call(webhookPost, {
  body: payload,
  headers: { "stripe-signature": signature, "content-type": "application/json" },
});
assert.equal(ignored.status, 200);
assert.equal(ignored.data.received, true);

restoreEnv();
console.log("dfyv checkout tests passed");
