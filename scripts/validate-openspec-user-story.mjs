import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const specPath = resolve(process.cwd(), ".openspec.json");
const raw = readFileSync(specPath, "utf8");
const data = JSON.parse(raw);

const failures = [];
const storyPattern = /^Como\s+.+,\s+quiero\s+.+\s+para\s+.+\.$/i;
const requirements = data?.requirements;

if (!requirements || typeof requirements !== "object") {
  console.error("[OpenSpec] Missing `requirements` root object.");
  process.exit(1);
}

for (const [phase, items] of Object.entries(requirements)) {
  if (!Array.isArray(items)) continue;

  for (const req of items) {
    const id = req?.id || "(without-id)";
    if (typeof id === "string" && id.startsWith("DOC-")) {
      continue;
    }
    const userStory = typeof req?.user_story === "string" ? req.user_story.trim() : "";

    if (!userStory) {
      failures.push(`${phase}/${id}: missing user_story`);
      continue;
    }

    if (!storyPattern.test(userStory)) {
      failures.push(
        `${phase}/${id}: invalid format. Expected 'Como X, quiero Y para Z.'`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("[OpenSpec] user_story validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[OpenSpec] user_story validation passed.");
