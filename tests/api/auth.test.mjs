import test from "node:test";
import assert from "node:assert/strict";
import { createLocalHmacAuthTokenService } from "../../dist/apps/persona1-api/src/auth.js";

test("local hmac auth service signs and verifies tokens", async () => {
  const auth = createLocalHmacAuthTokenService("secret");
  const token = await auth.sign({
    userId: "usr_1",
    email: "test@example.com",
    issuedAt: "2026-03-16T00:00:00.000Z"
  });

  assert.ok(token);

  const verified = await auth.verify(token);
  assert.equal(verified?.userId, "usr_1");
  assert.equal(verified?.email, "test@example.com");
});
