#!/usr/bin/env node
/**
 * verify-feature.mjs
 *
 * Script que la IA ejecuta después de implementar cualquier funcionalidad.
 * Verifica que la implementación no esté rota antes de declarar "terminado".
 *
 * Uso:
 *   node scripts/verify-feature.mjs
 *   node scripts/verify-feature.mjs --routes app.data-sources.tsx
 *
 * Lo que verifica:
 *   1. Build de producción (detecta imports rotos, componentes faltantes)
 *   2. Tests unitarios + integración
 *   3. Que los archivos modificados no tienen errores de lint
 *
 * Si algún paso falla → la IA DEBE corregir antes de decir que terminó.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const specificRoutes = args.includes("--routes") ? args[args.indexOf("--routes") + 1]?.split(",") : null;

const steps = [];
let failed = false;

function run(label, cmd, opts = {}) {
  process.stdout.write(`\n→ ${label}... `);
  try {
    execSync(cmd, { cwd: ROOT, stdio: opts.silent ? "pipe" : "inherit" });
    console.log("✅ OK");
    steps.push({ label, status: "ok" });
  } catch (err) {
    console.log("❌ FALLIDO");
    if (opts.showOutput && err.stdout) {
      console.log(err.stdout.toString().slice(0, 2000));
    }
    if (opts.showOutput && err.stderr) {
      console.log(err.stderr.toString().slice(0, 2000));
    }
    steps.push({ label, status: "fail" });
    failed = true;
  }
}

console.log(`
╔══════════════════════════════════════════════════════════════╗
║          VERIFICACIÓN DE FEATURE — post-implementación       ║
╠══════════════════════════════════════════════════════════════╣
║  REGLA: Antes de implementar, la IA DEBE:                    ║
║    1. Añadir el requisito a .openspec.json                   ║
║       → node scripts/add-requirement.mjs --id ... --title . ║
║    2. Si hay conflictos con requisitos existentes → PREGUNTAR ║
║       al usuario qué decisión tomar ANTES de implementar.    ║
╚══════════════════════════════════════════════════════════════╝
`);

// Step 1: Build (lo más importante — detecta lo que typecheck no detecta)
run("Build de producción (detecta imports rotos)", "npm run build", { showOutput: true });

// Step 2: Tests
run("Tests unitarios + integración", "npm --workspace @fluxbot/shopify-admin-app run test", { showOutput: true });

// Step 3: Lint de archivos específicos si se pasaron
if (specificRoutes) {
  const files = specificRoutes
    .map((f) => `apps/shopify-admin-app/app/routes/${f.trim()}`)
    .filter((f) => existsSync(resolve(ROOT, f)))
    .join(" ");

  if (files) {
    run(`Lint de archivos modificados`, `npx eslint --ignore-path .gitignore ${files}`, { showOutput: true });
  }
} else {
  run("Lint (archivos del admin app)", "npm run lint", { silent: true, showOutput: false });
}

// Summary
console.log(`
╔══════════════════════════════════════════════════════════════╗
║  RESULTADO FINAL                                             ║
╠══════════════════════════════════════════════════════════════╣`);

for (const step of steps) {
  const icon = step.status === "ok" ? "✅" : "❌";
  console.log(`║  ${icon}  ${step.label.padEnd(56)}║`);
}

console.log(`╚══════════════════════════════════════════════════════════════╝`);

if (failed) {
  console.log(`
❌ VERIFICACIÓN FALLIDA — La IA debe corregir los errores antes de declarar que terminó.
`);
  process.exit(1);
} else {
  console.log(`
✅ VERIFICACIÓN PASADA — La implementación compila, pasa tests y lint.
`);
}
