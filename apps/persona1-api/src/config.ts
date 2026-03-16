import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import YAML from "yaml";
import { FilesystemPersona1Repository, PostgresPersona1Repository, type Persona1Repository } from "../../../packages/db/src/index.js";
import { createBillingService, type BillingService } from "../../../packages/billing/src/index.js";
import {
  createFirebaseJwtVerifier,
  createLocalHmacAuthTokenService,
  type AuthTokenService
} from "./auth.js";

export interface Persona1RuntimeConfig {
  port: number;
  businessId: string;
  inferenceProvider: "openrouter";
  model: string;
  apiBaseUrl: string;
  storageMode: "filesystem" | "postgres";
  authMode: "local_hmac" | "firebase_jwt";
  repository: Persona1Repository;
  billing: BillingService;
  authTokens: AuthTokenService;
  freeUses: number;
}

interface RawBusinessConfig {
  business?: {
    slug?: string;
    inference_provider?: string;
    default_model?: string;
    api_base_url?: string;
  };
  pricing?: {
    free_uses?: number;
    launch_plan?: {
      id?: string;
      price_usd?: number;
      stripe_price_id?: string;
    };
  };
}

export async function loadRuntimeConfig(): Promise<Persona1RuntimeConfig> {
  const configPath = path.resolve("C:/Users/moham/persona1/businesses/persona1/config.yaml");
  const rawConfig = YAML.parse(await fs.readFile(configPath, "utf8")) as RawBusinessConfig;
  const databaseUrl = process.env.AI_OS_DATABASE_URL?.trim() || process.env.PERSONA1_DATABASE_URL?.trim() || null;
  const repository = databaseUrl
    ? new PostgresPersona1Repository(databaseUrl)
    : new FilesystemPersona1Repository({
        rootDir: path.resolve(process.env.PERSONA1_DATA_DIR ?? "C:/Users/moham/persona1/.persona1-data")
      });
  const authSecret = process.env.PERSONA1_AUTH_SECRET?.trim() || crypto.randomBytes(32).toString("hex");
  const freeUses = Number(rawConfig.pricing?.free_uses ?? 3);
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim() || null;
  const authTokens =
    firebaseProjectId && process.env.PERSONA1_AUTH_MODE?.trim() === "firebase_jwt"
      ? createFirebaseJwtVerifier({
          projectId: firebaseProjectId
        })
      : createLocalHmacAuthTokenService(authSecret);

  return {
    port: Number(process.env.PORT ?? "8787"),
    businessId: rawConfig.business?.slug ?? "persona1",
    inferenceProvider: "openrouter",
    model: process.env.OPENROUTER_MODEL?.trim() || rawConfig.business?.default_model || "openai/gpt-4.1-mini",
    apiBaseUrl: process.env.PERSONA1_APP_BASE_URL?.trim() || rawConfig.business?.api_base_url || "http://127.0.0.1:8787",
    storageMode: databaseUrl ? "postgres" : "filesystem",
    authMode: authTokens.mode,
    repository,
    billing: createBillingService({
      freeUses,
      launchPlanId: rawConfig.pricing?.launch_plan?.id ?? "monthly",
      launchPlanPriceUsd: Number(rawConfig.pricing?.launch_plan?.price_usd ?? 9),
      stripePriceId: rawConfig.pricing?.launch_plan?.stripe_price_id ?? process.env.STRIPE_PRICE_ID?.trim() ?? null,
      appBaseUrl: process.env.PERSONA1_APP_BASE_URL?.trim() || "http://127.0.0.1:8787",
      stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() ?? null,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? null
    }),
    authTokens,
    freeUses
  };
}
