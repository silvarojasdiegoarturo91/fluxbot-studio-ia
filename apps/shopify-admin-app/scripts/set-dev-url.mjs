import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const devUrl = process.argv[2];

if (!devUrl || !/^https:\/\//.test(devUrl)) {
  console.error("Usage: node scripts/set-dev-url.mjs <https-url>");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const tomlPath = path.join(appDir, "shopify.app.toml");

let toml = fs.readFileSync(tomlPath, "utf8");

toml = toml.replace(
  /^application_url\s*=\s*".*"$/m,
  `application_url = "${devUrl}"`,
);

const authBlock = `[auth]\nredirect_urls = [\n  "${devUrl}/auth/callback",\n  "${devUrl}/auth/shopify/callback",\n  "${devUrl}/api/auth/callback"\n]\n\n`;

if (/\[auth\][\s\S]*?\n(?=\[pos\])/m.test(toml)) {
  toml = toml.replace(/\[auth\][\s\S]*?\n(?=\[pos\])/m, authBlock);
} else {
  toml += `\n${authBlock}`;
}

fs.writeFileSync(tomlPath, toml);
console.log(`Updated shopify.app.toml with dev URL: ${devUrl}`);
