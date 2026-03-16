import { createOpenRouterConversationAnalyzer } from "../../../packages/ai-kernel/src/index.js";
import { loadRuntimeConfig } from "./config.js";
import { createPersona1ApiServer } from "./server.js";

const config = await loadRuntimeConfig();
const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
const analyzer = openRouterApiKey
  ? createOpenRouterConversationAnalyzer({
      apiKey: openRouterApiKey,
      model: config.model,
      appName: "persona1",
      voicePackId: config.voicePackId,
      voicePackText: config.voicePackText
    })
  : null;

const server = createPersona1ApiServer({
  config,
  analyzer
});

server.listen(config.port, "127.0.0.1", () => {
  process.stdout.write(`persona1-api listening on http://127.0.0.1:${config.port}\n`);
});
