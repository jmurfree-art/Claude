/**
 * Stripe-ready subscription structure.
 *
 * Billing is not wired up yet — this module defines the plan catalog that
 * both the billing page and (later) Stripe checkout/webhooks will share.
 * When enabling Stripe:
 *   1. Create matching Products/Prices in the Stripe dashboard.
 *   2. Fill in `stripePriceId` for each paid plan.
 *   3. Add a checkout route + webhook handler that updates
 *      `profiles.stripe_customer_id / stripe_subscription_id / plan`.
 */

export type PlanId = "free" | "creator" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  /** Stripe Price ID — placeholder until billing is enabled. */
  stripePriceId: string | null;
  videosPerMonth: number;
  maxScriptChars: number;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    stripePriceId: null,
    videosPerMonth: 3,
    maxScriptChars: 500,
    features: [
      "3 videos per month",
      "Stock avatars & voices",
      "720p export",
      "Watermarked output",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    priceMonthlyUsd: 29,
    stripePriceId: null,
    videosPerMonth: 30,
    maxScriptChars: 2000,
    features: [
      "30 videos per month",
      "All avatars & voices",
      "1080p export",
      "No watermark",
      "Priority rendering",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthlyUsd: 89,
    stripePriceId: null,
    videosPerMonth: 120,
    maxScriptChars: 2000,
    features: [
      "120 videos per month",
      "All avatars & voices",
      "1080p export",
      "No watermark",
      "API access (coming soon)",
      "Team seats (coming soon)",
    ],
  },
];

export function getPlan(id: string): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}
