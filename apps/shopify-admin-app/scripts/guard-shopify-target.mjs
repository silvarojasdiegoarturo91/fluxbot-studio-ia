import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_APP = {
  clientId: "8c36112e98ce36be869eb0dc5efdd572",
  name: "fluxbot-studio",
};

const PRODUCTION_APP = {
  clientId: "3e33f15eca7b32e62ea7137311172df5",
  name: "fluxbot-studio-ia-shopify",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const tomlPath = path.join(appDir, "shopify.app.toml");

function fail(message) {
  console.error(`\n[guard:local-target] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(tomlPath)) {
  fail(`Missing ${tomlPath}. Create the local config before running dev/deploy.`);
}

const toml = fs.readFileSync(tomlPath, "utf8");
const clientIdMatch = toml.match(/^\s*client_id\s*=\s*"([^"]+)"/m);
const nameMatch = toml.match(/^\s*name\s*=\s*"([^"]+)"/m);

const tomlClientId = clientIdMatch?.[1]?.trim();
const tomlName = nameMatch?.[1]?.trim();
const envApiKey = process.env.SHOPIFY_API_KEY?.trim();

if (!tomlClientId) {
  fail("shopify.app.toml has no client_id.");
}

if (tomlClientId === PRODUCTION_APP.clientId) {
  fail(
    `shopify.app.toml points to PRODUCTION (${PRODUCTION_APP.name}). This repo is locked to LOCAL (${LOCAL_APP.name}).`,
  );
}

if (tomlClientId !== LOCAL_APP.clientId) {
  fail(
    `Unexpected client_id in shopify.app.toml: ${tomlClientId}. Expected LOCAL app id ${LOCAL_APP.clientId}.`,
  );
}

if (tomlName !== LOCAL_APP.name) {
  fail(`Unexpected app name "${tomlName ?? "unknown"}". Expected "${LOCAL_APP.name}".`);
}

if (envApiKey && envApiKey !== LOCAL_APP.clientId) {
  fail(
    `SHOPIFY_API_KEY does not match LOCAL app id. Found ${envApiKey}. Expected ${LOCAL_APP.clientId}.`,
  );
}

if (envApiKey === PRODUCTION_APP.clientId) {
  fail(`SHOPIFY_API_KEY points to PRODUCTION (${PRODUCTION_APP.name}).`);
}

console.log(`[guard:local-target] OK (${LOCAL_APP.name})`);
