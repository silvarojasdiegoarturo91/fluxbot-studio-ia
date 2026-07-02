import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveAppUrl() {
  const candidate = process.argv[2] || process.env.SHOPIFY_APP_URL;

  if (!candidate) {
    console.error("Missing app URL. Pass it as an argument or set SHOPIFY_APP_URL.");
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    console.error(`Invalid app URL: ${candidate}`);
    process.exit(1);
  }

  if (parsed.protocol !== "https:") {
    console.error(`App URL must use https: ${candidate}`);
    process.exit(1);
  }

  const ephemeralTunnel = [
    ".ngrok-free.dev",
    ".ngrok.io",
    ".trycloudflare.com",
  ].some((suffix) => parsed.hostname.endsWith(suffix));

  if (
    ephemeralTunnel &&
    process.env.FLUXBOT_ALLOW_EPHEMERAL_APP_URL !== "1"
  ) {
    console.error(
      [
        `Refusing to persist ephemeral tunnel URL: ${candidate}`,
        "Use npm run dev and let Shopify CLI update dev preview URLs at runtime.",
        "For one-off legacy tunnel tests, set FLUXBOT_ALLOW_EPHEMERAL_APP_URL=1 explicitly.",
      ].join("\n"),
    );
    process.exit(1);
  }

  return parsed.toString().replace(/\/$/, "");
}

function replaceRequired(pattern, replacement, source, errorMessage) {
  if (!pattern.test(source)) {
    throw new Error(errorMessage);
  }

  return source.replace(pattern, replacement);
}

const appUrl = resolveAppUrl();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const tomlPath = path.join(appDir, "shopify.app.toml");

let toml = fs.readFileSync(tomlPath, "utf8");

toml = replaceRequired(
  /^application_url\s*=\s*".*"$/m,
  `application_url = "${appUrl}"`,
  toml,
  "shopify.app.toml is missing application_url",
);

toml = replaceRequired(
  /(\[app_proxy\][\s\S]*?^\s*url\s*=\s*").*?(")$/m,
  `$1${appUrl}$2`,
  toml,
  "shopify.app.toml is missing [app_proxy].url",
);

const authBlock = `[auth]
redirect_urls = [
  "${appUrl}/auth/callback",
  "${appUrl}/auth/shopify/callback",
  "${appUrl}/api/auth/callback"
]`;

if (/\[auth\][\s\S]*?(?=^\[|\Z)/m.test(toml)) {
  toml = toml.replace(/\[auth\][\s\S]*?(?=^\[|\Z)/m, `${authBlock}\n\n`);
} else {
  toml += `\n${authBlock}\n`;
}

fs.writeFileSync(tomlPath, toml);
console.log(`Updated shopify.app.toml with app URL: ${appUrl}`);
