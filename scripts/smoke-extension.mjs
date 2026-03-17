import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const extensionPath = fileURLToPath(new URL("../apps/persona1-ext", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona1-ext-smoke-"));

const fixtures = {
  "/linkedin": `<!doctype html>
    <html lang="en">
      <body>
        <main data-test-conversation-pane-wrapper>
          <div class="msg-thread-header__participant-names">Avery Chen</div>
          <div class="msg-thread">Avery: can you send the short version before we decide on a meeting?</div>
          <div class="msg-form">
            <div class="msg-form__contenteditable" contenteditable="true" role="textbox">wanted to follow up on the proposal and see if now is a better time to revisit it</div>
          </div>
        </main>
      </body>
    </html>`,
  "/gmail": `<!doctype html>
    <html lang="en">
      <body>
        <main class="nH">
          <span email="avery@example.com">avery@example.com</span>
          <div class="thread">Avery wrote: send me the shortest explanation first.</div>
          <div aria-label="Message Body" contenteditable="true" role="textbox">wanted to follow up and see if this is still of interest</div>
        </main>
      </body>
    </html>`,
  "/fallback": `<!doctype html>
    <html lang="en">
      <body>
        <p>They said they are interested but they want a tighter summary before they commit.</p>
        <textarea autofocus>just checking in to see if you had any thoughts on this</textarea>
      </body>
    </html>`
};

const server = http.createServer((request, response) => {
  const html = fixtures[request.url] || fixtures["/fallback"];
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

let apiProcess;
let context;
try {
  apiProcess = await ensureApiReady();
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  await runScenario({
    context,
    url: `${baseUrl}/linkedin`,
    composeSelector: ".msg-form__contenteditable",
    readDraft: () =>
      document.querySelector(".msg-form__contenteditable")?.innerText?.trim() || "",
    openMode: "click"
  });

  await runScenario({
    context,
    url: `${baseUrl}/gmail`,
    composeSelector: 'div[aria-label="Message Body"]',
    readDraft: () =>
      document.querySelector('div[aria-label="Message Body"]')?.innerText?.trim() || "",
    openMode: "hotkey"
  });

  await runScenario({
    context,
    url: `${baseUrl}/fallback`,
    composeSelector: "textarea",
    readDraft: () =>
      document.querySelector("textarea")?.value || "",
    openMode: "hotkey"
  });

  process.stdout.write("persona1 extension smoke passed\n");
} finally {
  await context?.close().catch(() => null);
  apiProcess?.kill();
  server.close();
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => null);
}

async function runScenario(input) {
  const page = await input.context.newPage();
  await page.goto(input.url, { waitUntil: "domcontentloaded" });
  await page.locator(input.composeSelector).click();

  const beforeInsert = await page.evaluate(input.readDraft);
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return Boolean(root?.querySelector('[data-p1-launcher="true"]'));
  });

  if (input.openMode === "click") {
    await page.evaluate(() => {
      const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
      root?.querySelector('[data-p1-launcher="true"]')?.click();
    });
  } else {
    await page.keyboard.press("Control+Shift+Space");
  }

  await page.waitForFunction(() => {
    const host = document.querySelector("[data-persona1-root]");
    return Boolean(host?.shadowRoot?.querySelector('[data-p1-hud="true"]'));
  });

  await page.waitForFunction(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return Boolean(root?.querySelector('[data-p1-branch-card="true"]'));
  }, { timeout: 60000 });

  const panelText = await page.evaluate(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return root?.querySelector('[data-p1-hud="true"]')?.innerText || "";
  });

  assert.match(panelText, /recommended|option 2|option 3|playable move|interesting move|weak move|drifts, no frame/i);
  assert.doesNotMatch(panelText, /cold start/i);

  await page.keyboard.press("1");

  await page.waitForFunction(
    (readDraftSource, previousValue) => {
      const nextValue = Function(`return (${readDraftSource})();`)();
      return nextValue !== previousValue;
    },
    input.readDraft.toString(),
    beforeInsert
  );

  const afterInsert = await page.evaluate(input.readDraft);
  assert.notEqual(afterInsert, beforeInsert);
  assert.ok(afterInsert.length > 10);
  await page.close();
}

async function ensureApiReady() {
  if (await canReachApi()) {
    return null;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("persona1 API is not running, and OPENROUTER_API_KEY is not set for starting a local API.");
  }

  const child = spawn(process.execPath, ["dist/apps/persona1-api/src/main.js"], {
    cwd: repoRoot,
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: process.env.PORT || "8787"
    }
  });

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
