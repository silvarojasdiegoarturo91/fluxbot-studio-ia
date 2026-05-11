#!/usr/bin/env node
/**
 * add-requirement.mjs
 *
 * Añade un nuevo requisito al .openspec.json y verifica que no haya conflictos
 * con los existentes. Si hay conflictos, aborta y muestra qué revisar.
 *
 * La IA DEBE ejecutar este script ANTES de implementar cualquier cambio pedido.
 * Si el script retorna exit 1 → la IA debe preguntar al usuario qué hacer.
 *
 * Uso:
 *   node scripts/add-requirement.mjs \
 *     --id "REQ-BE-P1-003" \
 *     --title "Título del requisito" \
 *     --description "Descripción detallada" \
 *     --user-story "Como desarrollador, quiero X para Y" \
 *     --phase "phase1" \
 *     [--priority "HIGH"] \
 *     [--status "PLANNED"] \
 *     [--dry-run]   # solo verifica, no escribe
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OPENSPEC_PATH = resolve(ROOT, ".openspec.json");

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const id = arg("--id");
const title = arg("--title");
const description = arg("--description");
const userStory = arg("--user-story");
const phase = arg("--phase") || "phase1";
const priority = arg("--priority") || "MEDIUM";
const status = arg("--status") || "PLANNED";
const dryRun = process.argv.includes("--dry-run");

// ── Validaciones de entrada ──────────────────────────────────────────────────
if (!id || !title || !description || !userStory) {
  console.error(`
❌ Faltan argumentos obligatorios.

Uso:
  node scripts/add-requirement.mjs \\
    --id "REQ-XX-P1-001" \\
    --title "Título" \\
    --description "Descripción" \\
    --user-story "Como X, quiero Y para Z" \\
    --phase "phase1"
  `);
  process.exit(1);
}

if (!/^Como .+, quiero .+ para .+/i.test(userStory)) {
  console.error(`❌ El user story no sigue el formato: "Como X, quiero Y para Z"`);
  console.error(`   Recibido: "${userStory}"`);
  process.exit(1);
}

// ── Cargar openspec ──────────────────────────────────────────────────────────
let openspec;
try {
  openspec = JSON.parse(readFileSync(OPENSPEC_PATH, "utf-8"));
} catch {
  console.error(`❌ No se pudo leer ${OPENSPEC_PATH}`);
  process.exit(1);
}

const reqs = openspec.requirements;
const isObject = !Array.isArray(reqs);

// ── Verificar ID duplicado ───────────────────────────────────────────────────
const allExisting = isObject ? Object.values(reqs).flat() : reqs;
const existingIds = allExisting.map((r) => r.id);

if (existingIds.includes(id)) {
  console.error(`❌ Ya existe un requisito con ID "${id}". Usa un ID diferente.`);
  process.exit(1);
}

// ── Verificar conflictos con el script de análisis ───────────────────────────
console.log(`\n🔍 Verificando conflictos con requisitos existentes...\n`);
try {
  execSync(
    `node ${resolve(ROOT, "scripts/check-openspec-conflicts.mjs")} --new-title "${title}" --new-desc "${description}"`,
    { stdio: "inherit" }
  );
  console.log("✅ Sin conflictos. Procediendo a añadir el requisito.\n");
} catch (err) {
  const code = err.status ?? 1;
  if (code === 1) {
    console.error(`
╔══════════════════════════════════════════════════════════════╗
║  ⛔ CONFLICTO DETECTADO — implementación bloqueada           ║
╠══════════════════════════════════════════════════════════════╣
║  El nuevo requisito contradice o duplica uno existente.      ║
║  La IA DEBE preguntar al usuario antes de continuar.         ║
╚══════════════════════════════════════════════════════════════╝

Opciones posibles:
  A) Reemplazar el requisito existente (eliminar el antiguo)
  B) Modificar el nuevo para que sea compatible
  C) Mantener ambos si son partes diferentes de la funcionalidad
  D) Cancelar el cambio
`);
    process.exit(1);
  }
  // exit 2 = warnings only, continuar
  console.log("⚠️  Hay avisos (ver arriba), pero no bloquean. Procediendo...\n");
}

if (dryRun) {
  console.log("🔎 --dry-run activado. El siguiente requisito SE AÑADIRÍA:");
  console.log(JSON.stringify({ id, title, description, user_story: userStory, priority, status }, null, 2));
  process.exit(0);
}

// ── Añadir el requisito ──────────────────────────────────────────────────────
const newReq = {
  id,
  title,
  description,
  user_story: userStory,
  priority,
  status,
};

if (isObject) {
  if (!reqs[phase]) {
    reqs[phase] = [];
  }
  reqs[phase].push(newReq);
} else {
  reqs.push({ ...newReq, phase });
}

writeFileSync(OPENSPEC_PATH, JSON.stringify(openspec, null, 2) + "\n", "utf-8");

console.log(`✅ Requisito añadido a .openspec.json:`);
console.log(`   ID:    ${id}`);
console.log(`   Fase:  ${phase}`);
console.log(`   Título: ${title}`);
console.log(`\n⚠️  Recuerda: commitear el .openspec.json junto con la implementación.\n`);
