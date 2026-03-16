import Stripe from "stripe";
import type { UserRecord } from "../../../packages/db/src/index.js";
import type {
  BillingConfig,
  BillingWebhookEvent,
  CheckoutRequest,
  CheckoutResult,
  UsageSnapshot
} from "./types.js";

export interface BillingService {
  createUsageSnapshot(user: UserRecord | null): UsageSnapshot;
  canAnalyze(user: UserRecord | null): UsageSnapshot;
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutResult>;
  parseWebhook(payload: string, signature: string | undefined): BillingWebhookEvent;
}

export function createBillingService(config: BillingConfig): BillingService {
  const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

  return {
    createUsageSnapshot(user) {
      const usageCount = user?.usageCount ?? 0;
      const plan = user?.plan ?? "free";
      const remainingFreeUses = Math.max(config.freeUses - usageCount, 0);

      return {
        plan,
        usageCount,
        freeUses: config.freeUses,
        remainingFreeUses,
        paywallReached: plan === "free" && remainingFreeUses === 0
      };
    },

    canAnalyze(user) {
      return this.createUsageSnapshot(user);
    },

    async createCheckoutSession(request) {
      if (!stripe || !config.stripePriceId) {
        return {
          ok: false,
          mode: "disabled",
          url: null,
          reason: "Stripe checkout is not configured."
        };
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            price: config.stripePriceId,
            quantity: 1
          }
        ],
        customer_email: request.email,
        client_reference_id: request.userId,
        success_url: `${config.appBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.appBaseUrl}/billing/cancel`
      });

      return {
        ok: true,
        mode: "stripe",
        url: session.url ?? null,
        reason: session.url ? null : "Stripe did not return a checkout URL."
      };
    },

    parseWebhook(payload, signature) {
      if (!stripe || !config.webhookSecret || !signature) {
        return {
          kind: "ignored",
          userId: null,
          subscriptionId: null,
          customerId: null
        };
      }

      const event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
      const session = event.data.object as Stripe.Checkout.Session;

      if (event.type === "checkout.session.completed") {
        return {
          kind: "subscription_active",
          userId: session.client_reference_id ?? null,
          subscriptionId:
            typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
          customerId:
            typeof session.customer === "string" ? session.customer : session.customer?.id ?? null
        };
      }

      if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          kind: "subscription_canceled",
          userId: subscription.metadata?.userId ?? null,
          subscriptionId: subscription.id,
          customerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id ?? null
        };
      }

      return {
        kind: "ignored",
        userId: null,
        subscriptionId: null,
        customerId: null
      };
    }
  };
}
