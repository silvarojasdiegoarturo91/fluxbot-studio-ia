#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, watch } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const specPath = path.join(cwd, '.openspec.json');

function loadSpec() {
  if (!existsSync(specPath)) {
    throw new Error(`Missing .openspec.json at ${specPath}`);
  }
  return JSON.parse(readFileSync(specPath, 'utf8'));
}

function getPhases(spec) {
  return Object.entries(spec.requirements ?? {});
}

function flattenRequirements(spec) {
  return getPhases(spec).flatMap(([phase, requirements]) =>
    (Array.isArray(requirements) ? requirements : []).map((requirement) => ({ phase, requirement })),
  );
}

function slug(value) {
  return String(value ?? '').trim().toLowerCase();
}

function phaseSummary(spec) {
  return getPhases(spec).map(([phase, requirements]) => {
    const list = Array.isArray(requirements) ? requirements : [];
    const counts = {
      total: list.length,
      completed: list.filter((item) => slug(item.status) === 'completed').length,
      inProgress: list.filter((item) => slug(item.status) === 'in-progress').length,
      planned: list.filter((item) => slug(item.status) === 'planned').length,
      blocked: list.filter((item) => slug(item.status) === 'blocked').length,
    };
    return { phase, ...counts };
  });
}

function renderStatus(spec) {
  const lines = [];
  lines.push(`Project: ${spec.project?.name ?? 'Unknown project'}`);
  lines.push(`Status: ${spec.project?.status ?? 'unknown'}`);
  lines.push('');
  lines.push('Phase summary');
  for (const item of phaseSummary(spec)) {
    lines.push(
      `- ${item.phase}: total=${item.total}, completed=${item.completed}, in-progress=${item.inProgress}, planned=${item.planned}, blocked=${item.blocked}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function validateSpec(spec) {
  const errors = [];
  if (!spec.project || typeof spec.project !== 'object') {
    errors.push('Missing project object');
  }
  if (!spec.requirements || typeof spec.requirements !== 'object') {
    errors.push('Missing requirements object');
  }
  for (const [phase, requirements] of getPhases(spec)) {
    if (!Array.isArray(requirements)) {
      errors.push(`Phase ${phase} must be an array`);
      continue;
    }
    for (const requirement of requirements) {
      if (!requirement?.id) errors.push(`Phase ${phase} has a requirement without id`);
      if (!requirement?.title) errors.push(`${requirement?.id ?? 'unknown'} is missing title`);
      if (!requirement?.status) errors.push(`${requirement?.id ?? 'unknown'} is missing status`);
      if (!requirement?.priority) errors.push(`${requirement?.id ?? 'unknown'} is missing priority`);
      if (!Array.isArray(requirement?.acceptance_criteria) || requirement.acceptance_criteria.length === 0) {
        errors.push(`${requirement?.id ?? 'unknown'} needs acceptance_criteria`);
      }
    }
  }
  return errors;
}

function renderRoadmap(spec) {
  const lines = ['Roadmap'];
  for (const item of phaseSummary(spec)) {
    lines.push(`- ${item.phase}: ${item.completed}/${item.total} completed`);
  }
  return `${lines.join('\n')}\n`;
}

function renderTrace(spec) {
  const lines = ['Traceability'];
  for (const { phase, requirement } of flattenRequirements(spec)) {
    const deps = Array.isArray(requirement.dependencies) ? requirement.dependencies : [];
    lines.push(`- ${requirement.id} [${phase}] -> ${deps.length ? deps.join(', ') : 'no dependencies'}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderRisks(spec) {
  const risky = flattenRequirements(spec).filter(({ requirement }) => {
    const status = slug(requirement.status);
    const priority = slug(requirement.priority);
    return status === 'blocked' || (priority === 'critical' && status !== 'completed');
  });
  const lines = ['Risks'];
  if (risky.length === 0) {
    lines.push('- No critical open risks detected');
  } else {
    for (const { phase, requirement } of risky) {
      lines.push(`- ${requirement.id} [${phase}] ${requirement.priority}/${requirement.status}: ${requirement.title}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderMetrics(spec) {
  const items = phaseSummary(spec);
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const completed = items.reduce((sum, item) => sum + item.completed, 0);
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);
  const lines = [
    'Metrics',
    `- total_requirements: ${total}`,
    `- completed_requirements: ${completed}`,
    `- completion_rate: ${completionRate}%`,
  ];
  return `${lines.join('\n')}\n`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMarkdown(spec) {
  const lines = [
    `# ${spec.project?.name ?? 'OpenSpec report'}`,
    '',
    `**Status:** ${spec.project?.status ?? 'unknown'}`,
    '',
    '| Phase | Total | Completed | In Progress | Planned | Blocked |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const item of phaseSummary(spec)) {
    lines.push(`| ${item.phase} | ${item.total} | ${item.completed} | ${item.inProgress} | ${item.planned} | ${item.blocked} |`);
  }
  lines.push('');
  for (const [phase, requirements] of getPhases(spec)) {
    lines.push(`## ${phase}`);
    lines.push('');
    for (const requirement of requirements) {
      lines.push(`- **${requirement.id}** (${requirement.status}, ${requirement.priority}) - ${requirement.title}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function renderHtml(spec) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(spec.project?.name ?? 'OpenSpec report')}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${escapeHtml(spec.project?.name ?? 'OpenSpec report')}</h1>
  <p><strong>Status:</strong> ${escapeHtml(spec.project?.status ?? 'unknown')}</p>
  <table>
    <thead>
      <tr><th>Phase</th><th>Total</th><th>Completed</th><th>In Progress</th><th>Planned</th><th>Blocked</th></tr>
    </thead>
    <tbody>
      ${phaseSummary(spec)
        .map(
          (item) =>
            `<tr><td>${escapeHtml(item.phase)}</td><td>${item.total}</td><td>${item.completed}</td><td>${item.inProgress}</td><td>${item.planned}</td><td>${item.blocked}</td></tr>`,
        )
        .join('')}
    </tbody>
  </table>
  ${getPhases(spec)
    .map(
      ([phase, requirements]) => `
        <h2>${escapeHtml(phase)}</h2>
        <ul>
          ${requirements
            .map(
              (requirement) =>
                `<li><strong>${escapeHtml(requirement.id)}</strong> (${escapeHtml(requirement.status)}, ${escapeHtml(requirement.priority)}) - ${escapeHtml(requirement.title)}</li>`,
            )
            .join('')}
        </ul>`,
    )
    .join('')}
</body>
</html>
`;
}

async function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function writeReport(spec, format, output) {
  let content;
  if (format === 'json') content = `${JSON.stringify(spec, null, 2)}\n`;
  else if (format === 'markdown') content = renderMarkdown(spec);
  else if (format === 'html') content = renderHtml(spec);
  else throw new Error(`Unsupported format: ${format}`);
  await ensureParentDir(output);
  await writeFile(output, content, 'utf8');
  console.log(`Report written to ${output}`);
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  const spec = loadSpec();

  switch (command) {
    case 'status':
      process.stdout.write(renderStatus(spec));
      break;
    case 'validate': {
      const errors = validateSpec(spec);
      if (errors.length > 0) {
        for (const error of errors) console.error(`ERROR: ${error}`);
        process.exitCode = 1;
        return;
      }
      console.log('OpenSpec validation passed');
      break;
    }
    case 'roadmap':
      process.stdout.write(renderRoadmap(spec));
      break;
    case 'trace':
      process.stdout.write(renderTrace(spec));
      break;
    case 'risks':
      process.stdout.write(renderRisks(spec));
      break;
    case 'metrics':
      process.stdout.write(renderMetrics(spec));
      break;
    case 'report': {
      const format = getArgValue('--format') ?? 'json';
      const output = path.resolve(cwd, getArgValue('--output') ?? `reports/openspec-report.${format === 'markdown' ? 'md' : format}`);
      await writeReport(spec, format, output);
      break;
    }
    case 'watch':
      mkdirSync(path.join(cwd, 'reports'), { recursive: true });
      process.stdout.write(renderStatus(spec));
      console.log(`Watching ${specPath} for changes...`);
      watch(specPath, () => {
        try {
          process.stdout.write(`\nUpdated at ${new Date().toISOString()}\n`);
          process.stdout.write(renderStatus(loadSpec()));
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
        }
      });
      break;
    default:
      console.error(`Unknown command: ${command ?? '(missing)'}`);
      process.exitCode = 1;
  }
}

await main();
