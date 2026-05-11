import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const localContract = path.resolve(repoRoot, 'contracts/fluxbot-ia-api.v1.yaml');
const sourceContract = process.env.CONTRACTS_REPO_PATH
  ? path.resolve(process.env.CONTRACTS_REPO_PATH, 'openapi/fluxbot-ia-api.v1.yaml')
  : path.resolve(repoRoot, '../fluxbot-studio-contracts/openapi/fluxbot-ia-api.v1.yaml');

if (!existsSync(localContract)) {
  throw new Error(`Local contract missing: ${localContract}. Run "npm run contracts:pull".`);
}

const localContent = await readFile(localContract, 'utf8');
if (!localContent.includes('openapi: 3.0.3')) {
  throw new Error(`Local contract does not look like a valid OpenAPI file: ${localContract}`);
}

if (!existsSync(sourceContract)) {
  console.log(`Source contract not found at ${sourceContract}; validated local copy only.`);
  process.exit(0);
}

const sourceContent = await readFile(sourceContract, 'utf8');
if (localContent !== sourceContent) {
  throw new Error('Local contract is out of sync with fluxbot-studio-contracts. Run "npm run contracts:pull".');
}

console.log('Contract is in sync with fluxbot-studio-contracts.');
