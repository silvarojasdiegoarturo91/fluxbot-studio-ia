#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const specPath = path.join(repoRoot, '.openspec.json');
const mode = process.argv[2] ?? 'post-commit';
const docPattern = /(^|\/)(agents\.md|claude\.md|readme\.md|[^/]+\.(md|mdc))$/i;

function runGit(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function getChangedFiles() {
  try {
    switch (mode) {
      case 'post-commit':
        return runGit(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).split('\n');
      case 'post-merge':
        return runGit(['diff', '--name-only', 'ORIG_HEAD', 'HEAD']).split('\n');
      case 'post-checkout':
        return process.argv.length >= 5 ? runGit(['diff', '--name-only', process.argv[3], process.argv[4]]).split('\n') : [];
      default:
        return [];
    }
  } catch {
    return [];
  }
}

function normalizeFiles(files) {
  return [...new Set(files.map((file) => file.trim()).filter(Boolean))];
}

function isDocFile(file) {
  return docPattern.test(file) && !file.startsWith('reports/');
}

function buildTask(files, commit) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    id: `DOC-${commit}-${stamp}`,
    title: `Review documentation update (${files.length} files)`,
    description: `Documentation changed in: ${files.join(', ')}. Review and align agent instructions, references, and related docs.`,
    priority: 'medium',
    status: 'planned',
    owner: 'docs',
    components: files,
    source_files: files,
    acceptance_criteria: [
      'Documentation references remain synchronized',
      'Agent instructions stay aligned with the latest docs',
      'Follow-up work is tracked in OpenSpec',
    ],
    dependencies: [],
    metrics: {
      quality_score: 90,
      completion_rate: 0,
      velocity: 1,
    },
  };
}

function main() {
  if (!existsSync(specPath)) return;
  const changed = normalizeFiles(getChangedFiles()).filter(isDocFile);
  if (changed.length === 0) return;

  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  spec.requirements ??= {};
  spec.requirements.documentation = Array.isArray(spec.requirements.documentation)
    ? spec.requirements.documentation
    : [];

  const commit = runGit(['rev-parse', '--short', 'HEAD']);
  const task = buildTask(changed, commit);
  spec.requirements.documentation.push(task);
  spec.project = spec.project ?? {};
  spec.project.last_updated = new Date().toISOString();

  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  console.log(`[OpenSpec] added docs task ${task.id}`);
}

main();
