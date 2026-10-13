import { json } from "../lib/http.js";
import { CHECKOUT_COMING_SOON, blobConfigured, paidPath, writeJsonBlob } from "../lib/storage.js";
import { getStripe, isCheckoutSessionId } from "../lib/stripe.js";

export async function POST(request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return json({ message: CHECKOUT_COMING_SOON }, 503);
  }
  const signature = request.headers.get("stripe-signature");
  const raw = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature failed", error?.message || error);
    return json({ message: "Invalid webhook signature." }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object || {};
    if (isCheckoutSessionId(session.id) && blobConfigured()) {
      try {
        await writeJsonBlob(paidPath(session.id), {
          sessionId: session.id,
          packageId: session.metadata?.packageId || "",
          packageName: session.metadata?.packageName || "",
          paymentStatus: session.payment_status || "",
          email: session.customer_details?.email || session.customer_email || "",
          amountTotal: session.amount_total ?? null,
          recordedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Could not store paid session", error?.message || error);
        return json({ message: "Webhook received but could not be stored." }, 500);
      }
    }
  }

  return json({ received: true, stored: blobConfigured() });
}
