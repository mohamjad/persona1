import type { UserPlan } from "../../../packages/db/src/index.js";

export interface BillingConfig {
  freeUses: number;
  launchPlanId: string;
  launchPlanPriceUsd: number;
  stripePriceId: string | null;
  appBaseUrl: string;
  stripeSecretKey: string | null;
  webhookSecret: string | null;
}

export interface UsageSnapshot {
  plan: UserPlan;
  usageCount: number;
  freeUses: number;
  remainingFreeUses: number;
  paywallReached: boolean;
}

export interface CheckoutRequest {
  userId: string;
  email: string;
}

export interface CheckoutResult {
  ok: boolean;
  mode: "stripe" | "disabled";
  url: string | null;
  reason: string | null;
}

export interface BillingWebhookEvent {
  kind: "subscription_active" | "subscription_canceled" | "ignored";
  userId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
}
