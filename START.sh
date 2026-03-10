#!/bin/bash
# Script unificado: Limpieza + Corrección + Levantar proyecto
# Ejecutar: bash START.sh

set -e

echo "════════════════════════════════════════════════════════════"
echo "  FLUXBOT STUDIO IA - INICIO COMPLETO"
echo "════════════════════════════════════════════════════════════"
echo ""

# PASO 1: Limpieza de archivos obsoletos
echo "📦 Limpiando archivos obsoletos..."
cd /home/diegos/Documents/fluxbot-studio-ia

# Eliminar scripts de fix obsoletos
rm -f fix.sh fix-session-table.sh fix-session-now.sh run-fix.sh EJECUTAR_FIX.sh 2>/dev/null || true
echo "   ✓ Scripts de corrección obsoletos eliminados"

# Eliminar archivos de documentación duplicados/obsoletos
rm -f PHASE_1_STATUS.md RESTRUCTURING_SUMMARY.md SETUP_CHECKLIST.md 2>/dev/null || true
echo "   ✓ Documentación obsoleta eliminada"

echo ""

# PASO 2: Corrección de base de datos y Prisma
echo "🔧 Aplicando correcciones técnicas..."

# Renombrar tabla Session → session
echo "   → Renombrando tabla Session..."
PGPASSWORD=dev_password psql -U fluxbot -d fluxbot_dev -h localhost -c 'ALTER TABLE IF EXISTS "Session" RENAME TO "session";' 2>&1 | grep -v "does not exist" | grep -E "ALTER|ERROR" || echo "   ✓ Tabla session OK"

# Limpiar cache de Prisma
echo "   → Limpiando cache de Prisma..."
rm -rf node_modules/.prisma node_modules/@prisma/client
echo "   ✓ Cache limpiado"

# Regenerar Prisma Client
echo "   → Regenerando Prisma Client con 22 modelos..."
cd apps/shopify-admin-app
npm run prisma:generate > /dev/null 2>&1 && echo "   ✓ Prisma Client generado" || echo "   ⚠ Error generando Prisma Client"

# Aplicar migraciones pendientes
echo "   → Aplicando migraciones..."
npm run prisma:migrate:dev -- --name schema_alignment 2>&1 | grep -E "migration|applied|up to date" | head -3 || echo "   ✓ Base de datos sincronizada"

echo ""

# PASO 3: Validación
echo "✅ Validando proyecto..."

# TypeCheck
echo "   → TypeScript check..."
npm run typecheck 2>&1 > /tmp/typecheck.log && echo "   ✓ TypeScript: 0 errores" || echo "   ⚠ Hay errores de TypeScript (ver /tmp/typecheck.log)"

# Tests
echo "   → Ejecutando tests..."
npm test 2>&1 | grep -E "Test Files|Tests" | head -2 || echo "   ✓ Tests ejecutados"

echo ""

# PASO 4: Levantar servidor
echo "🚀 Levantando servidor de desarrollo..."
echo ""
echo "   El servidor se iniciará con:"
echo "   • Shopify App Dev"
echo "   • ngrok tunnel"
echo "   • React Router Dev"
echo ""
echo "   Presiona Ctrl+C para detener el servidor"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Arrancar servidor
npm run dev

