# OpenSpec - Requirements Management

OpenSpec es una herramienta para gestionar, validar y rastrear requisitos a lo largo del ciclo de vida del proyecto.

## 📋 Descripción General

Este proyecto utiliza OpenSpec para definir y rastrear todos los requisitos funcionales, no funcionales y técnicos del **Fluxbot Studio IA**.

Los requisitos están organizados en:
- **Requisitos Funcionales (REQ-*)**: Funcionalidades del producto
- **Requisitos No-Funcionales**: Rendimiento, escalabilidad, seguridad
- **Requisitos Técnicos**: Stack tecnológico y decisiones de arquitectura

## 📂 Archivos de Configuración

### `.openspec.json`
Archivo principal con todos los requisitos, roadmap, dependencias y métricas.

**Estructura:**
```json
{
  "project": { /* metadata */ },
  "requirements": {
    "functional": [ /* REQ-* */ ],
    "non_functional": [ /* Rendimiento, seguridad, etc */ ],
    "technical": [ /* Stack y decisiones */ ]
  },
  "dependencies": { /* Trazabilidad */ },
  "roadmap": { /* Fases del proyecto */ },
  "compliance": { /* RGPD, SOC2, etc */ },
  "risks": [ /* Riesgos y mitigaciones */ ]
}
```

### `openspec.config.js`
Configuración avanzada de OpenSpec:
- Formato de reportes (HTML, Markdown, JSON)
- Reglas de validación
- Integración con CI/CD
- Seguimiento de cambios
- Notificaciones

## 🎯 Requisitos Principales por Fase

### Fase 0 ✅ (Completada)
- **REQ-AUTH-001**: Autenticación OAuth + JWT
- **REQ-ADMIN-001**: Admin app en Shopify
- **REQ-DB-001**: PostgreSQL + Prisma
- Tests de Fase 0 (68/68 passing)

### Fase 1 🔄 (En Progreso)
- **REQ-SYNC-001**: Sincronización de catálogo
- **REQ-CHAT-001**: Widget de chat
- **REQ-RAG-001**: Búsqueda semántica (RAG)
- **REQ-ANALYTICS-001**: Dashboard de analítica
- **REQ-MULTIMAIL-001**: Soporte multiidioma

### Fase 2 📅 (Planificado)
- **REQ-RECS-001**: Recomendaciones de productos
- **REQ-ORDER-001**: Consulta de pedidos
- **REQ-PRIVACY-001**: Cumplimiento RGPD
- **REQ-AUDIT-001**: Auditoría y logging

### Fase 3 📅 (Planificado)
- **REQ-PROACTIVE-001**: Mensajes proactivos
- **REQ-LLMS-001**: Generación de llms.txt (AEO)
- **REQ-BEHAVIOR-001**: Tracking de comportamiento

### Fase 4 📅 (Planificado)
- **REQ-HANDOFF-001**: Escalamiento a humano
- **REQ-SCALE-001**: Escalabilidad multi-tenant
- **REQ-AVAIL-001**: Alta disponibilidad

## 📊 Comandos

```bash
# Ver estado de todos los requisitos
npm run openspec:status

# Generar reporte HTML
npm run openspec:report:html

# Generar reporte Markdown
npm run openspec:report:md

# Validar requisitos
npm run openspec:validate

# Ver requisitos por fase
npm run openspec:phases

# Ver dependencias y trazabilidad
npm run openspec:trace

# Ver requisitos bloqueados/en riesgo
npm run openspec:risks
```

## 🔄 Ciclo de Vida de Requisitos

### Estados
- **planned**: No inicia
- **in-progress**: En desarrollo
- **completed**: Terminado y validado
- **blocked**: Bloqueado, esperando algo
- **deprecated**: Ya no es necesario

### Transiciones Válidas
```
planned → in-progress → completed
         ↘ blocked ↗
```

## ✅ Aceptación de Requisitos

Cada requisito tiene "acceptance_criteria" que definen cuándo se considera "completado":

**Ejemplo - REQ-CHAT-001:**
- [ ] Chat widget carga en la tienda
- [ ] Mensajes se envían al backend de IA
- [ ] Respuestas se muestran en tiempo real
- [ ] Historial de conversación guardado
- [ ] Recomendaciones mostradas

Un requisito solo se marca como **completed** cuando TODAS las acceptance_criteria se cumplen.

## 📦 Dependencias entre Requisitos

Los requisitos pueden tener dependencias:

```
REQ-RECS-001 (Recomendaciones)
  ↓ depends_on
REQ-RAG-001 (RAG Search)
  ↓ requires_data_from
REQ-SYNC-001 (Sincronización)
```

OpenSpec valida que:
- Las dependencias existan
- No haya ciclos
- Los requisitos bloqueadores estén completados

## 📈 Métricas y KPIs

El proyecto rastreak:
- **Tasa de Completitud**: % de requisitos completados
- **Velocity**: Requisitos completados por sprint
- **Coverage**: % de test coverage (>70% requerido)
- **Latencia**: Respuesta de chat < 3s (p95)
- **Uptime**: Disponibilidad del sistema (99.5% target)

Metrices de negocio:
- **Conversión**: +15% esperado
- **AOV**: +10% por recomendaciones
- **Soporte**: -30% tickets resueltos por IA

## 🔐 Cumplimiento

El proyecto debe ser cumplir:

- ✅ **RGPD**: Privacidad de datos, derecho a ser olvidado
- ✅ **Shopify Security**: Tokens OAuth seguros, sandbox
- ✅ **SOC 2**: Auditoría completa, encriptación
- 🔄 **EU AI Act**: Explainabilidad de decisiones IA

## 🚨 Riesgos Trackeados

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Alucinaciones LLM | 🔴 Alta | RAG grounding + confidence scores |
| Rate limits Shopify | 🟡 Media | Bulk ops + caching |
| Privacy compliance | 🔴 Crítica | Data minimization + audit logs |
| Performance widget | 🟡 Media | Lazy loading + monitoring |

## 📝 Cambios a Requisitos

Siempre que cambies un requisito:

1. Actualiza `.openspec.json`
2. Documenta el cambio en la sección "metadata"
3. Ejecuta `npm run openspec:validate`
4. El changelog se actualiza automáticamente en `REQUIREMENTS_CHANGELOG.md`

## 🔗 Integración con Tests

Los tests están linkados a requisitos:

```typescript
// test/phase0/auth-jwt.test.ts
describe('REQ-AUTH-001: OAuth & JWT', () => {
  it('should validate JWT signature', () => {
    // Validates acceptance criterion for REQ-AUTH-001
  });
});
```

OpenSpec valida que todo requisito marcado como "completed" tenga tests pasando.

## 📊 Reportes

### HTML Report
```bash
npm run openspec:report:html
# Genera: reports/openspec-report.html
```
Incluye:
- Estado de todos los requisitos
- Gráficos de progreso
- Matriz de trazabilidad
- Línea de tiempo

### Markdown Report
```bash
npm run openspec:report:md
# Genera: reports/openspec-report.md
```
Incluye:
- Lista de requisitos por fase
- Aceptación criteria
- Dependencias
- Riesgos

## 🚀 Próximos Pasos

1. Ejecuta los comandos anteriores para ver el estado actual
2. Revisa `.openspec.json` para entender la estructura completa
3. Cuando completes un requisito, actualiza su estado a "completed"
4. Si agregas un nuevo requisito, asignauna ID única (REQ-*)
5. Ejecuta `npm run openspec:validate` para validar la estructura

## 📚 Referencias

- [OpenSpec Documentation](https://openspec.dev)
- [Fluxbot Architecture](./documentation/ARCHITECTURE.md)
- [Project Status](./documentation/PROJECT_STATUS.md)
- [Test Documentation](./apps/shopify-admin-app/test/README.md)

---

**Última actualización**: Marzo 2026
