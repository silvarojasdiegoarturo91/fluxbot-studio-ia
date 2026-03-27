# 🚀 OpenSpec Quick Start

**TL;DR** - Comandos más usados:

```bash
# Ver estado de requisitos
npm run openspec:status

# Generar reporte HTML (Abre en navegador)
npm run openspec:report:html

# Validar requisitos
npm run openspec:validate

# Ver riesgos
npm run openspec:risks

# Watch en tiempo real
npm run openspec:watch
```

---

## 📊 Dashboard Rápido

### ✅ Completados (Fase 0)
- REQ-AUTH-001: OAuth + JWT
- REQ-ADMIN-001: Admin app
- REQ-DB-001: PostgreSQL
- REQ-TECH-001→006: Stack setup

### 🔄 En Progreso (Fase 1)
- REQ-SYNC-001: Syncronización
- REQ-CHAT-001: Chat widget
- REQ-RAG-001: Búsqueda
- REQ-ANALYTICS-001: Dashboard
- REQ-MULTIMAIL-001: Idiomas

### 📅 Planificados (Fase 2-4)
- 13 requisitos adicionales

---

## 📈 Métricas Principales

| Métrica | Target | Status |
|---------|--------|--------|
| Completitud | 100% | 30% ✅ |
| Test Coverage | >70% | In progress 🔄 |
| Latencia Chat | <3s p95 | To measure 📅 |
| Uptime | 99.5% | To measure 📅 |

---

## 🆘 Ayuda Rápida

**¿Cómo agrego un nuevo requisito?**
1. Edita `.openspec.json`
2. Agrega bajo `requirements.functional` o `requirements.non_functional`
3. Ejecuta `npm run openspec:validate`

**¿Cómo marko un requisito como completado?**
1. Cambia `"status": "in-progress"` → `"status": "completed"`
2. Ejecuta `npm run openspec:validate`
3. Commit los cambios

**¿Cómo veo dependencias?**
```bash
npm run openspec:trace
```

---

**Documentación completa**: Ver `OPENSPEC_GUIDE.md`  
**Setup details**: Ver `OPENSPEC_SETUP_COMPLETE.md`
