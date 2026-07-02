# Onboarding Requirements (Frontend)

## OpenSpec trace

- Root requirement: `REQ-ROOT-001`
- Shopify requirement: `REQ-OPEN-009`
- Shopify requirement: `REQ-OPEN-010`
- Covered behavior: pre-onboarding gating (no access to other routes/sections), final step button "Activar..." as activation trigger, completion persists state, ALL app pages/sections activate after completion, redirect automatically to `/app` (Panel), and step-to-step onboarding transitions must preserve the rendered shell while showing a loading skeleton instead of a blank refresh.

## Functional requirements

### Gating (bloqueo pre-onboarding)

- **FR-ONB-001:** A merchant with incomplete onboarding MUST be redirected to `/app/onboarding` when trying to access any other app route, section or page.
- **FR-ONB-001a:** While onboarding is not completed, the side navigation menu, dashboard, and ALL app controls/sections/pages MUST be hidden and inaccessible. The merchant MUST NOT be able to see or interact with any part of the app outside the onboarding flow.
- **FR-ONB-002:** A merchant with completed onboarding MUST see the normal dashboard, navigation menu, and all app sections/pages fully accessible.
- **FR-ONB-003:** If the app is uninstalled and later reinstalled for the same shop, onboarding MUST be required again before normal operation.

### Bug conocido: redireccion rota

- **FR-ONB-BUG-001:** [BUG CONFIRMADO] Actualmente, al hacer click en "Activar Fluxbot en mi tienda" en el ultimo paso, el usuario NO es redirigido a ningun lado. Se queda en la misma pagina de onboarding, estancado, sin poder continuar. Este bug debe ser corregido.
- **FR-ONB-BUG-002:** El usuario NO debe requerir hacer clic en ningun otro boton, enlace o control para salir del onboarding despues de hacer click en "Activar...". La redireccion debe ser automatica e inmediata.
- **FR-ONB-BUG-003:** Si el usuario hace click en "Activar..." y no es redirigido automaticamente al Panel, se considera un bug bloqueante. El unico destino valido post-click es /app (Panel).

### Activacion (boton "Activar..." y redireccion automatica)

- **FR-ONB-004:** The final onboarding step MUST have a button with text starting with "Activar..." (e.g. "Activar Fluxbot en mi tienda") that signals the activation moment.
- **FR-ONB-004a:** Clicking the "Activar..." button MUST mark onboarding as complete, persist the completion state, and redirect automatically to `/app` (Panel) — WITHOUT requiring any additional click, tap, or manual navigation by the user.
- **FR-ONB-004b:** Immediately after clicking "Activar...", ALL pages, sections, elements and controls of the app MUST become activated (menu visible, routes accessible, dashboard shown).
- **FR-ONB-004c:** The redirect to `/app` MUST happen without requiring an additional click, manual refresh, or any other user action. The user MUST NOT need to click anywhere else to leave the onboarding.

### Bug confirmado: Panel no se muestra despues de activacion (NUEVO)

- **FR-ONB-004d:** [CRITICO - BUG CONFIRMADO] Inmediatamente despues de hacer click en "Activar Fluxbot en mi tienda", el Panel (`/app`) DEBE mostrar su contenido completo: tarjetas de dashboard, estadisticas, conexion de tienda, graficos, estado del asistente y todas las secciones del Panel. NO debe mostrarse una pagina en blanco, un spinner infinito, un skeleton que nunca resuelve, un error boundary, ni la pagina de onboarding.
- **FR-ONB-004e:** [CRITICO] El menu lateral de navegacion DEBE estar visible, completamente renderizado y funcional desde el INSTANTE en que la pagina `/app` carga por primera vez despues del click en "Activar...". No debe requerir recarga manual, clic adicional, ni ninguna otra accion del usuario para aparecer. Cada item del menu (Dashboard, Configure, Growth, Operations) debe poder recibir clic inmediatamente.
- **FR-ONB-004f:** [CRITICO - BUG CONFIRMADO] TODAS las consultas de datos del dashboard DEBEN ejecutarse y resolverse correctamente en el primer load post-activacion. Esto incluye: conexion Shopify via Admin API, reporte de 7 dias (AnalyticsService), configuracion del chatbot (chatbotConfig), fuentes de conocimiento activas y totales, campañas activas, tareas de sincronizacion fallidas y en ejecucion, handoffs abiertos, y ultima sincronizacion completada. NINGUNA de estas consultas debe fallar silenciosamente o lanzar un error que impida que el dashboard se renderice. Si una consulta falla, el sistema DEBE tolerar el error y continuar mostrando el resto del contenido del Panel.
- **FR-ONB-004g:** [CRITICO] El banner de exito ("Asistente activado" / "Assistant activated") DEBE mostrarse en la parte superior del dashboard en el PRIMER renderizado post-redireccion. El banner debe ser del tipo `Banner tone="success"` de Polaris. Su contenido debe decir textualmente "El onboarding se completo correctamente. Tu centro de control ya esta habilitado." (es) / "Onboarding was completed successfully. Your control center is now fully enabled." (en). NO debe requerir refresh manual para aparecer.
- **FR-ONB-004h:** [CRITICO] La URL `onboarding=done` que habilita el banner de exito DEBE preservarse correctamente a traves de la navegacion embedded de Shopify. Los parametros `shop`, `host` y `embedded` DEBEN mantenerse. Si el contexto embedded pierde el parametro `onboarding=done`, el banner no se mostraria, pero el resto del Panel y menu deben seguir funcionando correctamente.
- **FR-ONB-004i:** [CRITICO - BUG CONFIRMADO] El usuario NO DEBE ser redirigido de vuelta a `/app/onboarding` bajo NINGUNA circunstancia despues de que el onboarding este completo. Una vez que `onboardingCompleted=true` persiste en la base de datos y el usuario llega a `/app`, los loaders de `app.tsx` y `app._index.tsx` NO DEBEN volver a enviarlo al onboarding. Si por algun motivo el valor de `onboardingCompleted` no se refleja inmediatamente en la siguiente lectura (race condition, cache, replica lag), el sistema DEBE tener un mecanismo de tolerancia que permita al usuario permanecer en el Panel.
- **FR-ONB-004j:** [CRITICO] No debe haber NINGUN estado intermedio donde el usuario vea una pagina en blanco, un error 500, un mensaje de "Handling response" de Shopify, o cualquier otra pantalla que no sea el Panel con su contenido completo. La transicion de `/app/onboarding` a `/app` debe ser instantanea y transparente.
- **FR-ONB-004k:** [CRITICO] Si ocurre un error en el loader de `app._index.tsx` (por ejemplo, falla la consulta GraphQL a Shopify Admin API), el loader NO debe lanzar una excepcion no manejada. Debe devolver un estado parcial con `fallbackData` mas un mensaje de alerta, permitiendo que al menos el shell del Panel, el menu de navegacion y el banner de exito se rendericen. El usuario nunca debe ver un ErrorBoundary en blanco.

### UX de transicion y carga

- **FR-ONB-005:** After install/reinstall OAuth authorization, onboarding/dashboard load MUST complete without leaving the merchant stuck on a "Handling response" intermediate screen.
- **FR-ONB-006:** When a merchant moves between onboarding steps, the app MUST preserve the onboarding shell and previously rendered content instead of looking like a full page refresh.
- **FR-ONB-007:** While the next onboarding step is loading, the UI MUST show a visible skeleton or loading state instead of a blank screen.
- **FR-ONB-008:** The loading state SHOULD include a branded animated robot/icon or equivalent attractive placeholder, and the transition MUST reserve stable layout space to avoid layout shift.
- **FR-ONB-009:** Step transitions MUST keep the parent onboarding route mounted so that shared controls, headings, and progress context do not disappear between steps.
- **FR-ONB-010:** Loading and transition states MUST remain accessible, with a meaningful non-visual status announcement and support for reduced-motion users.
- **FR-ONB-011:** If the next step fails to load, the app MUST keep the current onboarding shell visible and present a recoverable error state instead of collapsing to a blank page.

## Acceptance criteria

1. Given a shop with onboarding incomplete, when opening `/app`, then onboarding is shown.
2. Given a shop with onboarding complete, when opening `/app`, then dashboard is shown.
3. Given a previously completed shop, when `app/uninstalled` happens and app is reinstalled, then onboarding is shown again.
4. Given auth completes after install/reinstall, when the app route resolves, then the merchant sees usable UI without manual refresh.
5. Given a merchant clicks the final onboarding button, when the completion action succeeds, then the merchant is redirected automatically to `/app` without refreshing or clicking another control.
6. Given a merchant advances from one onboarding step to the next, when the next step is loading, then the onboarding shell remains visible and a skeleton/loading state is shown.
7. Given a merchant advances between onboarding steps, when the transition occurs, then the merchant does not see a blank screen, sudden route reset, or obvious full page refresh.
8. Given a step transition skeleton is displayed, when the next step finishes loading, then the skeleton is replaced without content jump or collapse.
9. Given the app is in a loading transition, when the state is announced to assistive technology, then the merchant receives a clear loading status without losing the current step context.
10. Given the merchant prefers reduced motion, when a step transition occurs, then the placeholder remains legible without requiring motion to understand that loading is happening.
11. Given the next step cannot be loaded, when the transition fails, then the current shell stays visible and the UI offers a recoverable error state.
