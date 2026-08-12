import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_APP = {
  clientId: "8c36112e98ce36be869eb0dc5efdd572",
  name: "fluxbot-studio",
};

const PRODUCTION_APP = {
  clientId: "3e33f15eca7b32e62ea7137311172df5",
  name: "fluxbot-studio-ia",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const productionTomlPath = path.join(appDir, "shopify.app.production.toml");

function fail(message) {
  console.error(`\n[guard:production-target] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(productionTomlPath)) {
  fail(`Missing ${productionTomlPath}. Create the production config before running deploy:production.`);
}

const productionToml = fs.readFileSync(productionTomlPath, "utf8");
const tomlClientId = productionToml.match(/^\s*client_id\s*=\s*"([^"]+)"/m)?.[1]?.trim();
const tomlName = productionToml.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1]?.trim();
const envApiKey = process.env.SHOPIFY_API_KEY?.trim();

if (!tomlClientId) {
  fail("shopify.app.production.toml has no client_id.");
}

if (tomlClientId === LOCAL_APP.clientId) {
  fail(
    `shopify.app.production.toml points to LOCAL (${LOCAL_APP.name}). Refusing to deploy production config with local identity.`,
  );
}

if (tomlClientId !== PRODUCTION_APP.clientId) {
  fail(
    `Unexpected client_id in shopify.app.production.toml: ${tomlClientId}. Expected PRODUCTION app id ${PRODUCTION_APP.clientId}.`,
  );
}

if (tomlName !== PRODUCTION_APP.name) {
  fail(`Unexpected app name "${tomlName ?? "unknown"}". Expected "${PRODUCTION_APP.name}".`);
}

if (envApiKey && envApiKey === LOCAL_APP.clientId) {
  fail(
    `SHOPIFY_API_KEY points to LOCAL (${LOCAL_APP.name}). Refusing to deploy the production config while holding local credentials.`,
  );
}

if (envApiKey && envApiKey !== PRODUCTION_APP.clientId) {
  fail(`SHOPIFY_API_KEY does not match PRODUCTION app id. Found ${envApiKey}. Expected ${PRODUCTION_APP.clientId}.`);
}

console.log(`[guard:production-target] OK (${PRODUCTION_APP.name})`);
