import test from "node:test";
import assert from "node:assert/strict";
import { createBillingService } from "../../dist/packages/billing/src/index.js";

test("billing service enforces free usage cap", () => {
  const billing = createBillingService({
    freeUses: 3,
    launchPlanId: "monthly",
    launchPlanPriceUsd: 9,
    stripePriceId: null,
    appBaseUrl: "http://127.0.0.1:8787",
    stripeSecretKey: null,
    webhookSecret: null
  });

  const freeSnapshot = billing.canAnalyze({
    userId: "usr_1",
    email: "test@example.com",
    plan: "free",
    authMode: "local_hmac",
    usageCount: 3,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z"
  });

  const paidSnapshot = billing.canAnalyze({
    userId: "usr_2",
    email: "paid@example.com",
    plan: "monthly",
    authMode: "local_hmac",
    usageCount: 99,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    createdAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z"
  });

  assert.equal(freeSnapshot.paywallReached, true);
  assert.equal(paidSnapshot.paywallReached, false);
});
