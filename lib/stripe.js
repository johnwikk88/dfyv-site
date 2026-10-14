import Stripe from "stripe";
import { STATEMENT_DESCRIPTOR } from "./packages.js";

let stripeClient;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient || stripeClient._dfyvKey !== key) {
    stripeClient = new Stripe(key);
    stripeClient._dfyvKey = key;
  }
  return stripeClient;
}

export function isCheckoutSessionId(value) {
  return typeof value === "string" && /^cs_(test|live)_[A-Za-z0-9]+$/.test(value);
}

function descriptorError(error) {
  const param = String(error?.param || error?.raw?.param || "");
  const message = String(error?.message || "");
  return param.includes("statement_descriptor") || /statement descriptor/i.test(message);
}

/**
 * Card Checkout rejects `statement_descriptor` and uses
 * `statement_descriptor_suffix` instead. The suffix is the exact
 * DONEFORYOUVISUALS string. If the account prefix makes the combined
 * descriptor longer than 22 characters, retry without the suffix so the
 * payment page still opens. Set the same string as the static statement
 * descriptor under Stripe → Settings → Public details.
 */
export async function createCheckoutSession(stripe, params) {
  const metadata = params.metadata;
  try {
    return await stripe.checkout.sessions.create({
      ...params,
      payment_intent_data: {
        metadata,
        statement_descriptor_suffix: STATEMENT_DESCRIPTOR,
      },
    });
  } catch (error) {
    if (!descriptorError(error)) throw error;
    console.error(
      "Stripe rejected statement descriptor suffix DONEFORYOUVISUALS. Retrying without it. Set the public statement descriptor to DONEFORYOUVISUALS in the Stripe Dashboard.",
    );
    return stripe.checkout.sessions.create({
      ...params,
      payment_intent_data: { metadata },
    });
  }
}

export async function retrievePaidSession(sessionId) {
  const stripe = getStripe();
  if (!stripe) return { error: "unconfigured" };
  if (!isCheckoutSessionId(sessionId)) return { error: "invalid" };
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });
    const paid = session.payment_status === "paid" || session.status === "complete";
    return { session, paid };
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === "resource_missing") {
      return { error: "missing" };
    }
    console.error("Stripe session lookup failed", error?.message || error);
    return { error: "lookup" };
  }
}
