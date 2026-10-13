/** Card statement descriptor. 17 characters, within Stripe's 22-character limit. */
export const STATEMENT_DESCRIPTOR = "DONEFORYOUVISUALS";

export const PACKAGES = {
  "local-starter": {
    id: "local-starter",
    name: "Local Starter",
    amount: 29700,
    description: "6–8 commercial AI images, human quality review, 1–2 revision rounds, and commercial usage rights.",
  },
  "tier-1": {
    id: "tier-1",
    name: "Tier 1 — Visuals Only",
    amount: 49700,
    description: "15 custom commercial AI images, 3 revision rounds, organized delivery, and full commercial usage rights.",
  },
  "tier-2": {
    id: "tier-2",
    name: "Tier 2 — Visuals + Content",
    amount: 99700,
    description: "Everything in Tier 1, plus captions, hashtags, posting times, and a 30-day content calendar.",
  },
  "tier-3": {
    id: "tier-3",
    name: "Tier 3 — Full Campaign",
    amount: 199700,
    description: "Everything in Tier 2, plus 20–25 ad-optimized images, format variations, ad copy, and campaign structure. One-time package.",
  },
};

export function getPackage(id) {
  if (typeof id !== "string") return null;
  return PACKAGES[id] || null;
}

export function formatUsd(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
