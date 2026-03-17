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
let apiServer;
let context;
let apiBaseUrl;
let mockStats = null;
try {
  ({ apiProcess, apiServer, apiBaseUrl, stats: mockStats } = await ensureApiReady());
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  await configureExtensionForSmoke(context, apiBaseUrl);

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
  apiServer?.close();
  server.close();
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => null);
}

async function runScenario(input) {
  const page = await input.context.newPage();
  await page.goto(input.url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body?.focus?.();
  });
  await page.locator(input.composeSelector).click();

  const beforeInsert = await page.evaluate(input.readDraft);
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return Boolean(root?.querySelector('[data-p1-launcher="true"]'));
  });
  await page.mouse.click(20, 20);
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return !root?.querySelector('[data-p1-launcher="true"]');
  });
  await page.locator(input.composeSelector).click();
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return Boolean(root?.querySelector('[data-p1-launcher="true"]'));
  });
  const launcherBadge = await page.evaluate(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return root?.querySelector('[data-p1-launcher="true"] [data-p1-badge="true"]')?.textContent?.trim() || "";
  });
  assert.notEqual(launcherBadge, "");

  const analyzeCallsBeforeOpen = mockStats?.analyzeCalls ?? null;
  await page.waitForTimeout(1100);

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
    return !root?.querySelector('[data-p1-launcher="true"]');
  });

  await page.waitForFunction(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return Boolean(root?.querySelector('[data-p1-orb="true"]'));
  }, { timeout: 60000 });
  if (mockStats && analyzeCallsBeforeOpen !== null) {
    assert.ok(mockStats.analyzeCalls >= analyzeCallsBeforeOpen + 1);
    assert.ok(mockStats.analyzeCalls <= analyzeCallsBeforeOpen + 2);
  }

  const initialHudText = await page.evaluate(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return root?.querySelector('[data-p1-hud="true"]')?.innerText || "";
  });
  assert.doesNotMatch(initialHudText, /how it unfolds/i);
  assert.doesNotMatch(initialHudText, /undefined/i);

  const overlayPlacement = await page.evaluate((selector) => {
    const compose = document.querySelector(selector);
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    const hud = root?.querySelector('[data-p1-hud="true"]');
    if (!compose || !hud) {
      return null;
    }

    const composeRect = compose.getBoundingClientRect();
    const hudRect = hud.getBoundingClientRect();
    return {
      composeLeft: composeRect.left,
      composeRight: composeRect.right,
      composeTop: composeRect.top,
      composeBottom: composeRect.bottom,
      hudLeft: hudRect.left,
      hudRight: hudRect.right,
      hudTop: hudRect.top,
      hudBottom: hudRect.bottom
    };
  }, input.composeSelector);

  assert.ok(overlayPlacement);
  assert.ok(overlayPlacement.hudLeft >= overlayPlacement.composeLeft - 16);
  assert.ok(overlayPlacement.hudRight <= overlayPlacement.composeRight + 16);

  const panelText = await page.evaluate(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return root?.querySelector('[data-p1-hud="true"]')?.innerText || "";
  });

  assert.match(panelText, /recommended|play/i);
  assert.doesNotMatch(panelText, /undefined/i);

  await page.evaluate(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    const orb = root?.querySelector('[data-p1-orb="true"]');
    orb?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });

  await page.waitForFunction(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return /how it unfolds/i.test(root?.querySelector('[data-p1-hud="true"]')?.innerText || "");
  });

  const previewText = await page.evaluate(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return root?.querySelector('[data-p1-hud="true"]')?.innerText || "";
  });
  assert.match(previewText, /how it unfolds/i);
  assert.match(panelText, /recommended|play/i);
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
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-persona1-root]")?.shadowRoot;
    return Boolean(root?.querySelector('[data-p1-launcher="true"]'));
  });
  await page.close();
}

async function ensureApiReady() {
  if (!process.env.PERSONA1_SMOKE_REAL_API) {
    return startMockApi();
  }

  if (!process.env.OPENROUTER_API_KEY) {
    if (await canReachApi("http://127.0.0.1:8787")) {
      return { apiProcess: null, apiServer: null, apiBaseUrl: "http://127.0.0.1:8787" };
    }
    throw new Error("OPENROUTER_API_KEY is not set for starting a clean local API, and no existing API is reachable.");
  }

  const apiPort = await allocatePort();
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const child = spawn(process.execPath, ["dist/apps/persona1-api/src/main.js"], {
    cwd: repoRoot,
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(apiPort)
    }
  });

  const started = await waitForApi(apiBaseUrl);
  if (!started) {
    child.kill();
    throw new Error(`persona1 API did not become healthy in time on ${apiBaseUrl}.`);
  }

  return { apiProcess: child, apiServer: null, apiBaseUrl };
}

async function canReachApi(apiBaseUrl) {
  try {
    const response = await fetch(`${apiBaseUrl}/v1/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApi(apiBaseUrl) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await canReachApi(apiBaseUrl)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function allocatePort() {
  const probe = http.createServer((_request, response) => response.end("ok"));
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function configureExtensionForSmoke(context, apiBaseUrl) {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }

  await serviceWorker.evaluate(async (baseUrl) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      p1_settings: {
        apiBaseUrl: baseUrl,
        keyboardShortcutsEnabled: true,
        autoOpenSidebar: true
      },
      p1_usage_count: 0,
      p1_plan: "free",
      p1_onboarding_done: false
    });
  }, apiBaseUrl);
}

function startMockApi() {
  const stats = {
    analyzeCalls: 0
  };
  const mockServer = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        service: "persona1-api",
        provider: "mock",
        model: "mock-branch-engine"
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/v1/analyze") {
      stats.analyzeCalls += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        situationRead: "they want a tighter summary before deciding whether to continue the thread",
        contextEvidence: [
          "they asked for the short version first",
          "the current draft sounds like generic follow-up language"
        ],
        toneTarget: "direct and calm",
        primaryGoal: "earn a low-friction next step",
        draftAssessment: {
          annotation: "?!",
          label: "soft edge",
          reason: "the draft is too generic to control the next move"
        },
        branches: [
          {
            optionId: 1,
            isRecommended: true,
            annotation: "!!",
            outcomeLabel: "get clarity",
            moveLabel: "tighten the ask",
            message: "want the one-line version or the two-minute version?",
            predictedResponse: "they pick one and reveal whether the thread is actually alive",
            opponentMoveType: "forced choice",
            branchPath: "choice -> clarity -> next step",
            strategicPayoff: "turns a vague thread into a concrete decision",
            goalAlignmentScore: 90,
            whyItWorks: "it lowers friction without surrendering frame",
            risk: null
          },
          {
            optionId: 2,
            isRecommended: false,
            annotation: "!",
            outcomeLabel: "test intent",
            moveLabel: "hold frame",
            message: "before i write the longer version, are you still seriously considering this or just curious?",
            predictedResponse: "they either qualify themselves or drift away",
            opponentMoveType: "intent test",
            branchPath: "pressure -> qualification -> answer",
            strategicPayoff: "surfaces intent quickly",
            goalAlignmentScore: 76,
            whyItWorks: "it trades smoothness for clarity",
            risk: "can feel sharp if the thread is still warm"
          },
          {
            optionId: 3,
            isRecommended: false,
            annotation: "!?",
            outcomeLabel: "lower pressure",
            moveLabel: "make it easy",
            message: "easy version: it helps teams stop losing time to vague follow-up loops.",
            predictedResponse: "they acknowledge it, but the thread may stay passive",
            opponentMoveType: "low-friction acknowledgment",
            branchPath: "easy answer -> passive reply -> weak reopen",
            strategicPayoff: "keeps the thread alive with low resistance",
            goalAlignmentScore: 62,
            whyItWorks: "it removes effort from the recipient",
            risk: "can preserve ambiguity instead of resolving it"
          }
        ],
        scoringSessionKey: "score_mock_linkedin",
        scoringConfig: {
          sessionKey: "score_mock_linkedin",
          primaryGoal: "earn a low-friction next step",
          toneTarget: "direct and calm",
          platform: "linkedin",
          relationshipType: "colleague",
          recipientSensitivity: 0.8,
          weights: {
            genericFollowUpPenalty: -2.9,
            hedgePenalty: -1.4,
            ambiguityPenalty: -1.8,
            clarityQuestionBonus: 1.9,
            concreteChoiceBonus: 1.8,
            nextStepBonus: 1.5,
            overlongPenalty: -1.5,
            warmthBonus: 0.3,
            pressurePenalty: -1.6
          },
          thresholds: {
            brilliant: 3.8,
            good: 2.2,
            interesting: 0.9,
            dubious: -0.3,
            weak: -1.3
          }
        },
        personaVersionUsed: 1,
        provider: "mock",
        model: "mock-branch-engine"
      }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found." }));
  });

  return new Promise((resolve) => {
    mockServer.listen(0, "127.0.0.1", () => {
      const address = mockServer.address();
      assert(address && typeof address === "object");
      resolve({
        apiProcess: null,
        apiServer: mockServer,
        apiBaseUrl: `http://127.0.0.1:${address.port}`,
        stats
      });
    });
  });
}
