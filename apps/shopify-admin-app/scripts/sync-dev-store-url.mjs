import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveDevStoreUrl() {
  const candidate = process.argv[2] || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_DEV_STORE_URL;

  if (!candidate) {
    return null;
  }

  const value = candidate
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (!value.endsWith(".myshopify.com")) {
    throw new Error(`Invalid dev store URL: ${value}`);
  }

  return value;
}

const devStoreUrl = resolveDevStoreUrl();

if (!devStoreUrl) {
  console.log("No SHOPIFY_SHOP/SHOPIFY_DEV_STORE_URL provided; keeping existing dev_store_url.");
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const tomlPath = path.join(appDir, "shopify.app.toml");

let toml = fs.readFileSync(tomlPath, "utf8");

if (!/^\s*dev_store_url\s*=\s*".*"\s*$/m.test(toml)) {
  throw new Error("shopify.app.toml is missing [build].dev_store_url");
}

toml = toml.replace(
  /^(\s*dev_store_url\s*=\s*").*?("\s*)$/m,
  `$1${devStoreUrl}$2`,
);

fs.writeFileSync(tomlPath, toml);
console.log(`Updated shopify.app.toml dev_store_url: ${devStoreUrl}`);
