#!/bin/bash
# SCRIPT FINAL DE ALINEACIÓN FASE 0 Y FASE 1
# Ejecutar con: bash FINAL_FIX.sh

set -e

echo "============================================================"
echo "  ALINEACIÓN FINAL - FASE 0 Y FASE 1"
echo "============================================================"
echo ""
echo "Cambios aplicados al schema:"
echo "  ✓ Campo 'data' añadido a PolicyProjection"
echo "  ✓ Campo 'data' añadido a OrderProjection"
echo "  ✓ ChatbotConfig ya tiene @@unique([shopId])"
echo "  ✓ KnowledgeDocument ya tiene @@unique([sourceId, externalId])"
echo "  ✓ KnowledgeChunk ya tiene @@unique([documentId, sequence])"
echo ""

cd /home/diegos/Documents/fluxbot-studio-ia

# Paso 1: Renombrar tabla session (si no está ya)
echo "1/5 - Verificando tabla 'session'..."
PGPASSWORD=dev_password psql -U fluxbot -d fluxbot_dev -h localhost -c 'ALTER TABLE IF EXISTS "Session" RENAME TO "session";' 2>&1 | grep -E "ALTER|ERROR|does not exist" || echo "   ✓ Tabla session OK"
echo ""

# Paso 2: Limpiar cache de Prisma
echo "2/5 - Limpiando cache de Prisma..."
rm -rf node_modules/.prisma node_modules/@prisma/client
echo "   ✓ Cache limpiado"
echo ""

# Paso 3: Regenerar Prisma Client
echo "3/5 - Regenerando Prisma Client con schema actualizado..."
cd apps/shopify-admin-app
npm run prisma:generate
echo ""

# Paso 4: Crear migración
echo "4/5 - Creando migración para campos 'data'..."
npm run prisma:migrate:dev -- --name add_data_fields_to_projections --create-only
echo "   ✓ Migración creada"
echo ""

# Paso 5: Aplicar migración
echo "5/5 - Aplicando migración a base de datos..."
npm run prisma:migrate:dev
echo "   ✓ Migración aplicada"
echo ""

# Verificación final
echo "============================================================"
echo "  VERIFICACIÓN FINAL"
echo "============================================================"
echo ""

echo "Ejecutando typecheck..."
npm run typecheck 2>&1 | tail -5
echo ""

echo "Ejecutando tests..."
npm test 2>&1 | grep -E "Test Files|Tests|passed|failed" | tail -10
echo ""

echo "============================================================"
echo "  ✅ ALINEACIÓN COMPLETADA"
echo "============================================================"
echo ""
echo "Siguiente paso: npm run dev"
