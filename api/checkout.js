import { json, readJson, siteOrigin } from "../lib/http.js";
import { getPackage } from "../lib/packages.js";
import { CHECKOUT_COMING_SOON } from "../lib/storage.js";
import { createCheckoutSession, getStripe } from "../lib/stripe.js";

export async function POST(request) {
  const body = await readJson(request);
  const pkg = getPackage(body?.packageId);
  if (!pkg) {
    return json({ message: "That package is not available." }, 400);
  }
  const stripe = getStripe();
  if (!stripe) {
    return json({ message: CHECKOUT_COMING_SOON }, 503);
  }

  const origin = siteOrigin(request);
  try {
    const session = await createCheckoutSession(stripe, {
      mode: "payment",
      customer_creation: "always",
      billing_address_collection: "auto",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pkg.amount,
            product_data: {
              name: pkg.name,
              description: pkg.description,
            },
          },
        },
      ],
      metadata: {
        packageId: pkg.id,
        packageName: pkg.name,
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
    });
    if (!session.url) {
      console.error("Stripe Checkout Session did not include a URL");
      return json({ message: "Checkout could not start. Please try again." }, 502);
    }
    return json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout Session failed", error?.message || error);
    return json({ message: "Checkout could not start. Please try again." }, 502);
  }
}
