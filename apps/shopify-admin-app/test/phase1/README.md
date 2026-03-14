# Phase 1 E2E Tests

## Prerequisitos

Los tests de Phase 1 requieren que la base de datos PostgreSQL esté configurada y las migraciones aplicadas.

### Setup Requerido

1. **Instalar PostgreSQL** (ver `documentation/PHASE_1_SETUP.md` en root del proyecto)

2. **Configurar .env.local** con DATABASE_URL correcto

3. **Aplicar migraciones**:
   ```bash
   npm run prisma:migrate:dev --name phase1_initial
   ```

4. **Verificar schema**:
   ```bash
   npx prisma studio
   ```
   
   Deberías ver 22 tablas creadas.

## Ejecutar Tests

```bash
# Solo Phase 1 E2E tests
npm test -- test/phase1

# Validacion profunda de Fase 1 (comando recomendado)
npm run test:phase1:deep

# Todos los tests (Phase 0 + Phase 1)
npm test
```

## Tests Incluidos

### 1. Conversation Management
- ✅ Crear conversación
- ✅ Guardar mensajes de usuario y bot
- ✅ Recuperar historial de conversación

### 2. Knowledge Base Integration  
- ✅ Crear fuentes de conocimiento
- ✅ Ingestar documentos
- ✅ Chunking de contenido
- ✅ Almacenar embeddings

### 3. Tool Invocations & Orchestration
- ✅ Registrar invocaciones de herramientas
- ✅ Crear solicitudes de handoff humano

### 4. Commerce Projections
- ✅ Proyección de productos
- ✅ Proyección de políticas
- ✅ Proyección de pedidos

### 5. Compliance & Privacy
- ✅ Registrar consentimientos
- ✅ Crear audit logs

### 6. Sync & Webhooks
- ✅ Encolar eventos de webhook
- ✅ Trackear jobs de sincronización

## Errores Comunes

### Error: "column does not exist in the current database"

**Causa**: Migraciones no aplicadas o schema desactualizado

**Solución**:
```bash
# Regenerar Prisma client
npm run prisma:generate

# Aplicar migraciones
npm run prisma:migrate:dev

# Si hay conflictos, reset (CUIDADO: borra datos)
npm run prisma:migrate:reset
```

### Error: "Failed to load url ~/db.server"

**Causa**: Alias de TypeScript no resuelto en tests

**Solución**: Ya corregido, usa import relativo `../../app/db.server`

### Error: Connection refused

**Causa**: PostgreSQL no está corriendo

**Solución**:
```bash
# Linux/macOS
sudo systemctl start postgresql

# Docker
docker-compose up -d postgres
```

## Estado Actual

✅ **VALIDADO (2026-03-12)**: La suite de Fase 1 y su validación profunda pasan en este repositorio.

Resultados verificados:
- `test/phase1/chat-e2e.test.ts`: `15/15`
- Integración profunda (`route-handlers` + `route-handlers-execution` + `service-execution`): `70/70`
- Suite completa del proyecto: `941/941`

Nota:
- Si aparece `Connection refused`, el problema suele ser infraestructura local (PostgreSQL detenido), no un bloqueo estructural de Fase 1.
