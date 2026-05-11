# No está registrando la finalización de las sincronizaciones

Status: needs-triage

## Resumen

Los sync jobs se quedan en `RUNNING` y no se registra su finalización, aunque el flujo ya debería haber terminado.

## Evidencia

| Job | Estado | Progreso | Items | Creado | Completado | Error |
| --- | --- | --- | --- | --- | --- | --- |
| initial:catalog | PENDING | 0% | 0 | 5/9/2026, 7:42:41 AM | - | - |
| initial:pages | RUNNING | 0% | 0 | 5/8/2026, 9:57:44 PM | - | - |
| initial:policies | RUNNING | 0% | 0 | 5/8/2026, 9:57:44 PM | - | - |
| initial:catalog | RUNNING | 0% | 0 | 5/8/2026, 9:57:44 PM | - | - |

## Comportamiento esperado

1. Al completar la sincronización, el job debe pasar a `COMPLETED` o al estado equivalente.
2. Debe persistirse fecha/hora de finalización.
3. El historial debe reflejar el avance real para poder auditar progreso y errores.

## Impacto

- No se puede verificar si la sincronización terminó realmente.
- El monitor operativo queda mostrando jobs activos de forma indefinida.
- Se dificulta detectar errores y medir capacidad operativa.

## Notas

- Revisar el punto donde se emite/consume el evento de finalización.
- Validar que el almacenamiento del estado no esté sobrescribiendo el cierre del job.
