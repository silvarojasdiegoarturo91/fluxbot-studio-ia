import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sourcePath = process.env.CONTRACTS_REPO_PATH
  ? path.resolve(process.env.CONTRACTS_REPO_PATH, 'openapi/fluxbot-ia-api.v1.yaml')
  : path.resolve(repoRoot, '../fluxbot-studio-contracts/openapi/fluxbot-ia-api.v1.yaml');
const destinationDir = path.resolve(repoRoot, 'contracts');
const destinationPath = path.resolve(destinationDir, 'fluxbot-ia-api.v1.yaml');

if (!existsSync(sourcePath)) {
  throw new Error(`Contract source not found: ${sourcePath}`);
}

await mkdir(destinationDir, { recursive: true });
await copyFile(sourcePath, destinationPath);

const contract = await readFile(destinationPath, 'utf8');
const versionLine = contract
  .split('\n')
  .find((line) => line.trim().startsWith('version:'));

console.log(`Contracts synced to ${destinationPath}${versionLine ? ` (${versionLine.trim()})` : ''}`);
