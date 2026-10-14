# Done For You Visuals — Site

Static multi-page portfolio and service site for DFYV, plus Stripe Checkout and a private photo upload after payment.

The pages are plain HTML. Server routes live in `api/` and run as Vercel Functions. Prices are set on the server in `lib/packages.js`, so the browser cannot change what a customer is charged.

## Local preview

```bash
npm install
npm start
```

Open http://127.0.0.1:4173

`npm run build` checks the server routes and rebuilds `checkout-success.js`.

## Packages

| Package | Price | Checkout id |
| --- | --- | --- |
| Local Starter | $297 | `local-starter` |
| Tier 1 — Visuals Only | $497 | `tier-1` |
| Tier 2 — Visuals + Content | $997 | `tier-2` |
| Tier 3 — Full Campaign | $1,997 | `tier-3` |

The $1,497/mo Tier 3 retainer is not sold through checkout. Customers still arrange that by message.

## What a customer sees

They pick a package and press a buy button. Stripe's hosted checkout page opens and asks for card details. If they pay, they land on a thank-you page, confirm their name, email, and business name, add notes, and upload photos. If they back out of Stripe, they land on a cancel page with a link back to pricing, and they are not charged. Until the Stripe secret key is set, the buy button stays on the page and shows "Checkout coming soon." instead of an error.

## Environment variables

Add these in the Vercel project **dfyv-site** under Settings → Environment Variables, for Production (and Preview if you want to test on a preview URL). Do not commit the values.

### `STRIPE_SECRET_KEY` (required for payments)

Stripe Dashboard → Developers → API keys → Secret key.

Use the test key (`sk_test_...`) until a real card payment looks right, then switch to the live key (`sk_live_...`). This is the only key the server uses to open Checkout.

### `STRIPE_WEBHOOK_SECRET` (optional)

Stripe Dashboard → Developers → Webhooks → Add endpoint.

- Endpoint URL: `https://dfyv-site.vercel.app/api/webhook`
- Event: `checkout.session.completed`
- After saving, open the endpoint and reveal the Signing secret (`whsec_...`).

The site still confirms a payment by asking Stripe about the Checkout session when the customer returns. The webhook records that same payment next to their photos when Blob is connected. Leave this unset until the endpoint exists. The buy buttons do not depend on it.

### `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` (required for photo upload)

Vercel Dashboard → Storage → Blob → Create a store. Choose **Private** so customer photos are not published on a public URL.

Connect that store to the **dfyv-site** project. Vercel then adds the token for you:

- Newer private stores use OIDC and set `BLOB_STORE_ID`.
- Token-based stores set `BLOB_READ_WRITE_TOKEN`. You can also copy it from the store's `.env.local` tab.

Either one is enough. The upload route checks for both. Photos go straight from the browser to Blob (so they are not limited by the 4.5 MB function body cap) under `orders/<checkout-session-id>/`. The name, email, business name, and notes are saved in that same folder as `intake.json`.

Set `BLOB_ACCESS` to `public` only if the connected store is a public store. The default is `private`.

### Statement descriptor `DONEFORYOUVISUALS`

Stripe Dashboard → Settings → Public details → Statement descriptor.

Set the statement descriptor to `DONEFORYOUVISUALS` (17 characters, under Stripe's 22-character card limit). Checkout also sends that exact string as the card statement-descriptor suffix. If a shortened prefix on the account makes the combined line too long, checkout still opens and the static descriptor from this settings page is what the customer sees.

## Deploy settings

`vercel.json` sets this for each deployment:

- Framework preset: Other (`"framework": null`)
- Build command: `npm run build`
- Output directory: `public`

The build copies the HTML, CSS, images, and browser scripts into `public/`. The `api/` routes stay at the project root, outside that folder, so Vercel serves `/api/checkout` and `/api/webhook` as functions. Do not deploy this branch to production until the env vars above are in place and a test-mode payment has been checked.

## Production compared with `main`

Live site: https://dfyv-site.vercel.app

The latest production deployment (`dpl_5iGfMvZ7JteEpTmSGaN1Q2TmLxpp`, 2026) has no git commit attached. It was a file upload, and `main` was behind that upload. This branch starts from the live pages, then adds checkout. What production had that `main` did not:

- Local Starter at $297, including the homepage band, comparison column, and Next Steps copy
- Header lockup (logo plus tagline), one `h1` per page, favicon, and canonical / Open Graph tags
- Sample photos on the example teasers
- Footer line "Van Nuys, CA" and the updated gallery and process wording
- Vercel Web Analytics snippet

`logo-mark.jpg` is on the production file tree and is not used by any page, so it is not in this branch. Merging this branch does not update https://dfyv-site.vercel.app until someone deploys it. This change does not deploy production.
