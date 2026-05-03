#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
QUERY_SCRIPT="${SCRIPT_DIR}/query.sh"

usage() {
  cat <<'EOF'
Usage:
  bash .claude/skills/shopify-admin/scripts/upload-file.sh <file-path> [alt-text]

Supported extensions:
  jpg, jpeg, png, gif, webp, svg, mp4, mov, webm, pdf
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 1
fi

FILE_PATH="$1"
ALT_TEXT="${2:-}"

if [[ ! -f "$FILE_PATH" ]]; then
  echo "File not found: $FILE_PATH" >&2
  exit 1
fi

FILE_INFO=$(node - "$FILE_PATH" "$ALT_TEXT" <<'NODE'
const fs = require("fs");
const path = require("path");

const [filePath, altText] = process.argv.slice(2);
const ext = path.extname(filePath).toLowerCase();
const fileName = path.basename(filePath);

const supported = {
  ".jpg": { mimeType: "image/jpeg", resource: "IMAGE", contentType: "IMAGE" },
  ".jpeg": { mimeType: "image/jpeg", resource: "IMAGE", contentType: "IMAGE" },
  ".png": { mimeType: "image/png", resource: "IMAGE", contentType: "IMAGE" },
  ".gif": { mimeType: "image/gif", resource: "IMAGE", contentType: "IMAGE" },
  ".webp": { mimeType: "image/webp", resource: "IMAGE", contentType: "IMAGE" },
  ".svg": { mimeType: "image/svg+xml", resource: "FILE", contentType: "FILE" },
  ".mp4": { mimeType: "video/mp4", resource: "VIDEO", contentType: "VIDEO" },
  ".mov": { mimeType: "video/quicktime", resource: "VIDEO", contentType: "VIDEO" },
  ".webm": { mimeType: "video/webm", resource: "VIDEO", contentType: "VIDEO" },
  ".pdf": { mimeType: "application/pdf", resource: "FILE", contentType: "FILE" },
};

const config = supported[ext];
if (!config) {
  console.error(`Unsupported file extension: ${ext || "(none)"}`);
  process.exit(1);
}

const size = fs.statSync(filePath).size;

process.stdout.write(JSON.stringify({
  fileName,
  filePath,
  altText,
  fileSize: size,
  ...config,
}));
NODE
)

FILE_NAME=$(node -e 'const data = JSON.parse(process.argv[1]); process.stdout.write(data.fileName);' "$FILE_INFO")
MIME_TYPE=$(node -e 'const data = JSON.parse(process.argv[1]); process.stdout.write(data.mimeType);' "$FILE_INFO")
RESOURCE=$(node -e 'const data = JSON.parse(process.argv[1]); process.stdout.write(data.resource);' "$FILE_INFO")
CONTENT_TYPE=$(node -e 'const data = JSON.parse(process.argv[1]); process.stdout.write(data.contentType);' "$FILE_INFO")
FILE_SIZE=$(node -e 'const data = JSON.parse(process.argv[1]); process.stdout.write(String(data.fileSize));' "$FILE_INFO")

STAGED_UPLOAD_MUTATION=$(cat <<'EOF'
mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}
EOF
)

STAGED_VARIABLES=$(node - "$FILE_NAME" "$MIME_TYPE" "$RESOURCE" "$FILE_SIZE" <<'NODE'
const [filename, mimeType, resource, fileSize] = process.argv.slice(2);
process.stdout.write(JSON.stringify({
  input: [
    {
      filename,
      mimeType,
      resource,
      fileSize: String(fileSize),
      httpMethod: "POST",
    },
  ],
}));
NODE
)

STAGED_RESPONSE=$(bash "$QUERY_SCRIPT" "$STAGED_UPLOAD_MUTATION" "$STAGED_VARIABLES")

STAGED_TARGET=$(printf '%s' "$STAGED_RESPONSE" | node <<'NODE'
let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const parsed = JSON.parse(raw);
  if (parsed.errors?.length) {
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }

  const userErrors = parsed.data?.stagedUploadsCreate?.userErrors ?? [];
  if (userErrors.length) {
    console.error(JSON.stringify(userErrors, null, 2));
    process.exit(1);
  }

  const target = parsed.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    console.error("No staged upload target returned by Shopify.");
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(target));
});
NODE
)

UPLOAD_URL=$(node -e 'const data = JSON.parse(process.argv[1]); process.stdout.write(data.url);' "$STAGED_TARGET")
RESOURCE_URL=$(node -e 'const data = JSON.parse(process.argv[1]); process.stdout.write(data.resourceUrl);' "$STAGED_TARGET")

UPLOAD_COMMAND=$(node - "$STAGED_TARGET" "$FILE_PATH" <<'NODE'
const [targetJson, filePath] = process.argv.slice(2);
const target = JSON.parse(targetJson);

const parts = [
  "curl",
  "-fsS",
  "-X",
  "POST",
  JSON.stringify(target.url),
];

for (const parameter of target.parameters ?? []) {
  parts.push("-F");
  parts.push(JSON.stringify(`${parameter.name}=${parameter.value}`));
}

parts.push("-F");
parts.push(JSON.stringify(`file=@${filePath}`));

process.stdout.write(parts.join(" "));
NODE
)

eval "$UPLOAD_COMMAND" >/dev/null

FILE_CREATE_MUTATION=$(cat <<'EOF'
mutation FileCreate($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files {
      __typename
      ... on MediaImage {
        id
        alt
        fileStatus
        image {
          url
        }
      }
      ... on Video {
        id
        alt
        fileStatus
        sources {
          url
          mimeType
          format
        }
      }
      ... on GenericFile {
        id
        alt
        fileStatus
        url
      }
    }
    userErrors {
      field
      message
    }
  }
}
EOF
)

FILE_CREATE_VARIABLES=$(node - "$RESOURCE_URL" "$CONTENT_TYPE" "$ALT_TEXT" <<'NODE'
const [originalSource, contentType, alt] = process.argv.slice(2);
process.stdout.write(JSON.stringify({
  files: [
    {
      originalSource,
      contentType,
      alt: alt || null,
    },
  ],
}));
NODE
)

bash "$QUERY_SCRIPT" "$FILE_CREATE_MUTATION" "$FILE_CREATE_VARIABLES" | node <<'NODE'
let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const parsed = JSON.parse(raw);
  if (parsed.errors?.length) {
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }

  const userErrors = parsed.data?.fileCreate?.userErrors ?? [];
  if (userErrors.length) {
    console.error(JSON.stringify(userErrors, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(parsed.data?.fileCreate?.files ?? [], null, 2));
});
NODE
