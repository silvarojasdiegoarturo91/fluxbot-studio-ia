#!/usr/bin/env node
/**
 * check-openspec-conflicts.mjs
 *
 * Analiza el .openspec.json actual y detecta:
 *   1. Requisitos duplicados (título muy similar)
 *   2. Requisitos contradictorios (verbos opuestos sobre el mismo objeto)
 *   3. IDs duplicados
 *
 * Uso:
 *   node scripts/check-openspec-conflicts.mjs
 *   node scripts/check-openspec-conflicts.mjs --new-title "Ocultar panel de FAQ" --new-desc "El panel no debe mostrarse"
 *
 * Exit codes:
 *   0 = sin conflictos
 *   1 = conflictos encontrados (la IA debe preguntar al usuario antes de proceder)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OPENSPEC_PATH = resolve(ROOT, ".openspec.json");

// Pares de verbos contradictorios (cualquier orden)
const CONTRADICTION_PAIRS = [
  ["mostrar", "ocultar"],
  ["show", "hide"],
  ["añadir", "eliminar"],
  ["agregar", "eliminar"],
  ["add", "remove"],
  ["add", "delete"],
  ["crear", "eliminar"],
  ["create", "delete"],
  ["habilitar", "deshabilitar"],
  ["enable", "disable"],
  ["activar", "desactivar"],
  ["activate", "deactivate"],
  ["permitir", "bloquear"],
  ["allow", "block"],
  ["incluir", "excluir"],
  ["include", "exclude"],
  ["requerir", "opcional"],
  ["required", "optional"],
  ["síncrono", "asíncrono"],
  ["sync", "async"],
];

const SIMILARITY_THRESHOLD = 0.45; // % palabras en común para considerar "similar"

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\w\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3); // ignorar palabras muy cortas
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function detectContradiction(tokensA, tokensB) {
  for (const [pos, neg] of CONTRADICTION_PAIRS) {
    const aHasPos = tokensA.includes(pos);
    const aHasNeg = tokensA.includes(neg);
    const bHasPos = tokensB.includes(pos);
    const bHasNeg = tokensB.includes(neg);

    if ((aHasPos && bHasNeg) || (aHasNeg && bHasPos)) {
      return { pos, neg };
    }
  }
  return null;
}

function flattenRequirements(openspec) {
  const reqs = openspec.requirements || openspec.specs || [];
  const all = Array.isArray(reqs) ? reqs : Object.values(reqs).flat();
  // Excluir entradas DOC auto-generadas (son snapshots de documentación, no requisitos)
  return all.filter((r) => r.id && !r.id.startsWith("DOC-"));
}

function loadOpenSpec() {
  try {
    return JSON.parse(readFileSync(OPENSPEC_PATH, "utf-8"));
  } catch {
    console.error(`❌ No se pudo leer ${OPENSPEC_PATH}`);
    process.exit(1);
  }
}

// ── Argumentos opcionales para comparar un nuevo requisito ──────────────────
const args = process.argv.slice(2);
const newTitleIdx = args.indexOf("--new-title");
const newDescIdx = args.indexOf("--new-desc");
const newTitle = newTitleIdx >= 0 ? args[newTitleIdx + 1] : null;
const newDesc = newDescIdx >= 0 ? args[newDescIdx + 1] : null;

const openspec = loadOpenSpec();
const allReqs = flattenRequirements(openspec);

let conflicts = [];
let warnings = [];

// ── 1. IDs duplicados ────────────────────────────────────────────────────────
const idCount = {};
for (const req of allReqs) {
  if (!req.id) continue;
  idCount[req.id] = (idCount[req.id] || 0) + 1;
}
for (const [id, count] of Object.entries(idCount)) {
  if (count > 1) {
    conflicts.push({
      type: "DUPLICATE_ID",
      message: `ID duplicado: "${id}" aparece ${count} veces`,
      ids: [id],
    });
  }
}

// ── 2. Títulos muy similares / contradictorios entre requisitos existentes ────
for (let i = 0; i < allReqs.length; i++) {
  for (let j = i + 1; j < allReqs.length; j++) {
    const a = allReqs[i];
    const b = allReqs[j];
    const tokA = tokenize(`${a.title} ${a.description || ""}`);
    const tokB = tokenize(`${b.title} ${b.description || ""}`);
    const sim = jaccardSimilarity(tokA, tokB);
    const contradiction = detectContradiction(tokA, tokB);

    if (contradiction && sim > 0.2) {
      conflicts.push({
        type: "CONTRADICTION",
        message: `Posible contradicción entre "${a.id}" y "${b.id}": uno usa "${contradiction.pos}" y el otro "${contradiction.neg}"`,
        ids: [a.id, b.id],
        similarity: Math.round(sim * 100),
      });
    } else if (sim >= SIMILARITY_THRESHOLD) {
      warnings.push({
        type: "DUPLICATE_SIMILAR",
        message: `Requisitos muy similares (${Math.round(sim * 100)}% similitud): "${a.id}" y "${b.id}"`,
        ids: [a.id, b.id],
        similarity: Math.round(sim * 100),
      });
    }
  }
}

// ── 3. Comparar nuevo requisito con los existentes ───────────────────────────
if (newTitle) {
  const newTokens = tokenize(`${newTitle} ${newDesc || ""}`);

  for (const req of allReqs) {
    const existingTokens = tokenize(`${req.title} ${req.description || ""}`);
    const sim = jaccardSimilarity(newTokens, existingTokens);
    const contradiction = detectContradiction(newTokens, existingTokens);

    if (contradiction && sim > 0.15) {
      conflicts.push({
        type: "NEW_CONTRADICTS_EXISTING",
        message: `El nuevo requisito contradice "${req.id}" (${req.title}): usa "${contradiction.pos}" vs "${contradiction.neg}"`,
        ids: [req.id],
        similarity: Math.round(sim * 100),
      });
    } else if (sim >= SIMILARITY_THRESHOLD) {
      warnings.push({
        type: "NEW_DUPLICATES_EXISTING",
        message: `El nuevo requisito es muy similar (${Math.round(sim * 100)}%) a "${req.id}" (${req.title}). ¿Es el mismo requisito?`,
        ids: [req.id],
        similarity: Math.round(sim * 100),
      });
    }
  }
}

// ── Salida ────────────────────────────────────────────────────────────────────
const hasProblems = conflicts.length > 0 || warnings.length > 0;

if (!hasProblems) {
  console.log("✅ Sin conflictos en OpenSpec.");
  process.exit(0);
}

console.log("");
if (conflicts.length > 0) {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ⚠️  CONFLICTOS EN OPENSPEC — requieren decisión del usuario  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  for (const c of conflicts) {
    console.log(`\n  [${c.type}] ${c.message}`);
    if (c.ids?.length) console.log(`  Requisitos afectados: ${c.ids.join(", ")}`);
  }
}

if (warnings.length > 0) {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ℹ️  AVISOS (posibles duplicados)                             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  for (const w of warnings) {
    console.log(`\n  [${w.type}] ${w.message}`);
    if (w.ids?.length) console.log(`  Requisitos relacionados: ${w.ids.join(", ")}`);
  }
}

console.log("");

// Conflictos = exit 1 (bloquea). Warnings = exit 2 (avisa pero no bloquea).
if (conflicts.length > 0) {
  process.exit(1);
} else {
  process.exit(2);
}
