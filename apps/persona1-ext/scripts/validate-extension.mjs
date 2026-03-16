import fs from "node:fs";
import path from "node:path";

const root = path.resolve("C:/Users/moham/persona1/apps/persona1-ext");
const requiredFiles = [
  "manifest.json",
  "background.js",
  "content-script.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "lib/messages.js",
  "lib/storage-keys.js",
  "lib/sidebar-machine.js",
  "lib/page-snapshot.js",
  "lib/api-client.js",
  "lib/persona-store.js",
  "lib/observation-log.js",
  "lib/mirror.js",
  "lib/scorecard.js",
  "lib/extractors/index.js",
  "lib/extractors/linkedin.js",
  "lib/extractors/gmail.js",
  "lib/extractors/twitter-dm.js",
  "lib/extractors/slack.js",
  "lib/extractors/dating-app.js",
  "lib/extractors/fallback.js"
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing extension file: ${relativePath}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error("Extension must remain on Manifest V3.");
}
if (!manifest.commands?.toggle_sidebar) {
  throw new Error("Manifest is missing the required toggle command.");
}

process.stdout.write("persona1 extension validation passed\n");
