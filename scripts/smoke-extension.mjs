import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const extensionPath = fileURLToPath(new URL("../apps/persona1-ext", import.meta.url));
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona1-ext-smoke-"));
const fixtureHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>persona1 smoke</title>
    <style>
      body { font-family: sans-serif; margin: 40px; }
      textarea { width: 640px; height: 180px; font: 16px/1.4 sans-serif; }
    </style>
  </head>
  <body>
    <h1>compose fixture</h1>
    <p>Avery said they are interested but do not want to jump into a full meeting until they see a tighter summary.</p>
    <textarea autofocus placeholder="Type here">wanted to follow up on the proposal and see if now is a better time to revisit it</textarea>
  </body>
</html>`;

const server = http.createServer((_, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(fixtureHtml);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address === "object");
const pageUrl = `http://127.0.0.1:${address.port}`;

let context;
let apiProcess;
try {
  apiProcess = await ensureApiReady();
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }

  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  const composeLocator = page.locator('textarea[placeholder="Type here"]');
  await composeLocator.click();

  await page.bringToFront();
  await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.tabs.sendMessage(tab.id, {
      type: "persona1:toggle-embedded-panel"
    });
  });

  await page.waitForFunction(() => {
    const host = document.querySelector('[data-persona1-root]');
    return Boolean(host?.shadowRoot?.querySelector("section"));
  });

  await page.evaluate(() => {
    const host = document.querySelector('[data-persona1-root]');
    const root = host.shadowRoot;
    const professional = root.querySelector('[data-cold-start="professional"]');
    if (professional) {
      professional.click();
    }
  });

  await page.waitForFunction(() => {
    const host = document.querySelector('[data-persona1-root]');
    return Boolean(host?.shadowRoot?.querySelector('[data-card="compose"]:not([hidden]) textarea[data-field="draft"]'));
  });

  await page.evaluate(() => {
    const host = document.querySelector('[data-persona1-root]');
    const root = host.shadowRoot;
    root.querySelector('[data-action="analyze"]').click();
  });

  await page.waitForFunction(() => {
    const host = document.querySelector('[data-persona1-root]');
    return Boolean(host?.shadowRoot?.querySelector('[data-role="branch-list"] [data-use="1"]'));
  }, { timeout: 60000 });

  const panelText = await page.evaluate(() => {
    const host = document.querySelector('[data-persona1-root]');
    return host.shadowRoot.querySelector("section")?.innerText || "";
  });

  assert.match(panelText, /recommended|option 1|option 2/i);
  assert.doesNotMatch(panelText, /This page has been blocked by Chrome/i);

  const beforeInsert = await composeLocator.inputValue();
  await page.evaluate(() => {
    const host = document.querySelector('[data-persona1-root]');
    host.shadowRoot.querySelector('[data-use="1"]').click();
  });

  await page.waitForFunction(
    (previousValue) => document.querySelector('textarea[placeholder="Type here"]').value !== previousValue,
    beforeInsert
  );

  const afterInsert = await composeLocator.inputValue();
  assert.notEqual(afterInsert, beforeInsert);
  assert.ok(afterInsert.length > 20);

  process.stdout.write("persona1 extension smoke passed\n");
} finally {
  await context?.close().catch(() => null);
  apiProcess?.kill();
  server.close();
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => null);
}

async function ensureApiReady() {
  if (await canReachApi()) {
    return null;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("persona1 API is not running, and OPENROUTER_API_KEY is not set for starting a local API.");
  }

  const child = spawn(process.execPath, ["dist/apps/persona1-api/src/main.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: process.env.PORT || "8787"
    }
  });

  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});

  const started = await waitForApi();
  if (!started) {
    child.kill();
    throw new Error("persona1 API did not become healthy in time.");
  }

  return child;
}

async function canReachApi() {
  try {
    const response = await fetch("http://127.0.0.1:8787/v1/health");
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApi() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await canReachApi()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
