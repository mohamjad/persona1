import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createPersona1ApiServer } from "../../dist/apps/persona1-api/src/index.js";
import { FilesystemPersona1Repository } from "../../dist/packages/db/src/index.js";
import { createBillingService } from "../../dist/packages/billing/src/index.js";
import { createLocalHmacAuthTokenService } from "../../dist/apps/persona1-api/src/auth.js";

test("api server exposes health and registration routes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona1-api-test-"));
  const server = createPersona1ApiServer({
    config: {
      port: 0,
      businessId: "persona1",
      inferenceProvider: "openrouter",
      model: "openai/gpt-4.1-mini",
      apiBaseUrl: "http://127.0.0.1",
      storageMode: "filesystem",
      authMode: "local_hmac",
      repository: new FilesystemPersona1Repository({ rootDir: tempDir }),
      billing: createBillingService({
        freeUses: 3,
        launchPlanId: "monthly",
        launchPlanPriceUsd: 9,
        stripePriceId: null,
        appBaseUrl: "http://127.0.0.1",
        stripeSecretKey: null,
        webhookSecret: null
      }),
      authTokens: createLocalHmacAuthTokenService("test-secret"),
      freeUses: 3
    },
    analyzer: null
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const health = await fetch(`http://127.0.0.1:${port}/v1/health`).then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.storageMode, "filesystem");

    const registerResponse = await fetch(`http://127.0.0.1:${port}/v1/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: "test@example.com",
        coldStartContext: "professional"
      })
    }).then((response) => response.json());

    assert.match(registerResponse.userId, /^usr_/);
    assert.ok(registerResponse.authToken);

    const analyzeResponse = await fetch(`http://127.0.0.1:${port}/v1/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        draft: "hello",
        preset: "pitch",
        userId: registerResponse.userId,
        context: {
          recipientName: "Ada",
          recipientHandle: null,
          communicationStyle: "professional",
          emotionalStateSignals: [],
          relationshipType: "colleague",
          platform: "linkedin",
          threadSummary: "Thread summary",
          recipientLastMessage: "Can you send details?",
          inferredWants: "clarity",
          inferredConcerns: "time",
          contextConfidence: 80
        }
      })
    });

    assert.equal(analyzeResponse.status, 503);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
