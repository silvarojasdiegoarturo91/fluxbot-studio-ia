# Instrucciones para Copilot — Configuración del Widget de Chat

## Credenciales para Testing

Si necesitas hacer pruebas en la tienda de desarrollo:
- **URL**: Tienda de prueba de Shopify (consultar variables de entorno o configuración local)
- **Contraseña**: `sialte`

---

## Problema Actual

La configuración del widget de chat tiene **dos fuentes de datos** que no están sincronizadas:

### 1. Admin Setup (Admin App)
- **Ubicaciones**: `app.onboarding.tsx` (Step 5) y `app.widget-settings.tsx`
- **Almacenamiento**: `shop.metadata.adminSetup.widgetBranding`
- **Propiedades**:
  - `primaryColor` (hex)
  - `launcherPosition` ("bottom-right" | "bottom-left")
  - `avatarStyle` ("assistant" | "spark" | "store")
  - `launcherLabel` (string)
  - `welcomeMessage` (string)

### 2. Theme Settings (Shopify Theme Editor)
- **Ubicación**: `chat_launcher.liquid` schema
- **Propiedades**:
  - `show_launcher` (boolean)
  - `launcher_position` ("bottom-right" | "bottom-left")
  - `primary_color` (color hex)
  - `welcome_message` (text)
  - `privacy_url`, `privacy_text`, `support_url`

### 3. Runtime del Widget (`chat-launcher.js`)
- **Lógica actual (PROBLEMÁTICA)**: El widget aplica primero los valores del DOM (theme settings) y solo usa los del admin API como fallback si no existen valores en el DOM.
- **Archivo**: `apps/storefront-widget/extensions/chat-widget/assets/chat-launcher.js:458-473`

## Síntomas del Bug

1. Un merchant configura `primaryColor: #FF5733` en el onboarding/admin
2. El widget muestra `#0070f3` (valor por defecto del theme)
3. O el merchant configura `launcherPosition: bottom-left` pero el widget aparece `bottom-right`

## Regla de Oro: SINGLE SOURCE OF TRUTH

**La configuración del admin (onboarding + widget-settings) debe ser la ÚNICA fuente de verdad.**

El theme editor DEBE reflejar la configuración del admin, no al revés.

---

## Reglas para Modificaciones

### 1. Al agregar una nueva propiedad de configuración

**ubicaciones obligatorias a modificar:**

1. **`apps/shopify-admin-app/app/services/admin-config.server.ts`**
   - Agregar a `WidgetBranding` interface
   - Agregar a `DEFAULT_ADMIN_CONFIG`
   - Agregar función de normalización si es necesario

2. **`apps/shopify-admin-app/app/routes/apps.fluxbot.widget-config.ts`**
   - Agregar a `extractWidgetBranding()` (líneas 41-78)

3. **`apps/shopify-admin-app/app/routes/app.onboarding.tsx`**
   - Agregar input en el Step 5 (Branding)
   - Agregar al handler de submit

4. **`apps/shopify-admin-app/app/routes/app.widget-settings.tsx`**
   - Agregar input en el formulario
   - Agregar al handler de submit

5. **`apps/storefront-widget/extensions/chat-widget/blocks/chat_launcher.liquid`**
   - **IMPORTANTE**: Si la propiedad NO debe ser configurable desde el theme editor, NO agregarla al schema
   - Si DEBE ser configurable desde theme, sincronizar con el admin

6. **`apps/storefront-widget/extensions/chat-widget/assets/chat-launcher.js`**
   - Aplicar el valor de la API del admin (no del DOM/theme)
   - El valor del admin SIEMPRE tiene prioridad

### 2. Sincronización de valores por defecto

Los valores por defecto deben ser IDÉNTICOS en:

| Propiedad | Admin Config Default | Theme Schema Default | JS Fallback |
|-----------|---------------------|---------------------|-------------|
| primaryColor | `#008060` | `#0070f3` | `#008060` |
| launcherPosition | `bottom-right` | `bottom-right` | `bottom-right` |
| launcherLabel | `Asistente` / `Assistant` | (no tiene) | `""` |
| avatarStyle | `assistant` | (no tiene) | `assistant` |
| welcomeMessage | (del admin) | `Hi! How can I help you today?` | (del admin) |

**Regla**: Si cambias un valor por defecto en admin-config.server.ts, cámbialo también en chat_launcher.liquid y chat-launcher.js.

### 3. Lógica de aplicación en el widget (chat-launcher.js)

**Patrón correcto para aplicar configuración:**

```javascript
function applyRemoteWidgetConfig(config) {
  if (!config || typeof config !== 'object') return;

  // 1. Usar valores del admin config como fuente primaria
  // 2. Solo usar theme/DOM como fallback último
  
  // ✅ CORRECTO: Admin tiene prioridad
  var nextLabel = sanitizeAttr(config.launcherLabel);
  launcherLabelText = nextLabel ? nextLabel.slice(0, 64) : '';
  
  // ✅ CORRECTO: Admin tiene prioridad
  if (config.primaryColor && /^#[0-9a-fA-F]{6}$/.test(config.primaryColor)) {
    document.documentElement.style.setProperty('--fluxbot-primary-color', config.primaryColor);
  }
  
  // ✅ CORRECTO: Admin tiene prioridad
  if (config.launcherPosition === 'bottom-left' || config.launcherPosition === 'bottom-right') {
    launcher.classList.remove('fluxbot-launcher--bottom-right', 'fluxbot-launcher--bottom-left');
    launcher.classList.add('fluxbot-launcher--' + config.launcherPosition);
  }
  
  // ❌ INCORRECTO: No verificar si existe valor en DOM primero
  // Esto hace que el theme tenga prioridad sobre el admin
  
  applyLauncherPresentation();
}
```

**NUNCA hacer esto:**
```javascript
// ❌ ESTO CAUSA EL BUG - Theme tiene prioridad sobre admin
if (!themePrimaryColor) {
  document.documentElement.style.setProperty('--fluxbot-primary-color', config.primaryColor);
}
```

### 4. Eliminar configuración redundante del theme

Si una propiedad ya existe en el admin, **eliminarla del schema del theme** para evitar confusión.

En `chat_launcher.liquid`, eliminar del schema:
- `primary_color` (ya está en admin)
- `launcher_position` (ya está en admin)
- `welcome_message` (ya está en admin)

Esto fuerza a los merchants a usar el admin para configurar el widget.

### 5. Validación de cambios

Después de cualquier modificación:

```bash
cd apps/shopify-admin-app && npm test
```

确保 que los tests de widget-config pasen.

---

## REGLA CRÍTICA: Preview del Onboarding debe ser IDÉNTICO al Widget Real

El preview que se muestra en el **onboarding** (Step 5 - Branding) debe ser **visualmente idéntico** al widget que aparece en el **storefront**. Esto es fundamental para que el merchant pueda ver exactamente lo que obtendrá.

### Diferencias actuales (PROBLEMA)

| Elemento | Widget Real (storefront) | Preview (onboarding) | Estado |
|----------|-------------------------|---------------------|--------|
| Botón launcher | 60x60px, border-radius: 50% | 58x58px, border-radius: 999px | ❌ Diferente |
| Iconos | SVG con animación de rotación (chat ↔ close) | Texto simple ("×" o "AI") | ❌ Diferente |
| Chat window | Animación slideUp (0.3s) | Sin animación | ❌ Diferente |
| Label | Transición opacity + transform cuando abre | Estático | ❌ Diferente |
| Posición label | `flex-direction: row-reverse` (bottom-right) | Diferente | ❌ Diferente |

### Por qué es importante

1. **Confianza del merchant**: Si el preview no coincide, el merchant no sabe qué obtendrá
2. **Soporte**: Diferencias causan tickets de soporte innecesarios
3. **Experiencia**: La primera impresión del widget define la percepción de la app

### Cómo lograr consistencia

#### 1. El preview debe usar los MISMOS estilos CSS

Copia los estilos exactos del widget real:

```css
/* De chat-launcher.css - USAR ESTOS EN EL PREVIEW */
.fluxbot-launcher__button {
  width: 60px;
  height: 60px;
  border-radius: 50%;  /* NO 999px */
  background-color: var(--fluxbot-primary-color);
  /* ... resto de estilos */
}

.fluxbot-launcher__icon {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fluxbot-launcher__icon--close {
  position: absolute;
  opacity: 0;
  transform: rotate(-90deg);
}

.fluxbot-launcher--open .fluxbot-launcher__icon--chat {
  opacity: 0;
  transform: rotate(90deg);
}

.fluxbot-launcher--open .fluxbot-launcher__icon--close {
  opacity: 1;
  transform: rotate(0deg);
}

/* Chat window animation */
.fluxbot-chat-window {
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
```

#### 2. El preview debe usar los MISMOS iconos SVG

Usa la función `getLauncherIconMarkup()` del widget real:

```jsx
// En app.onboarding.tsx - Preview
const getLauncherIconMarkup = (style) => {
  if (style === 'spark') {
    return '<path d="M12 3L13.9 8.1L19 10L13.9 11.9L12 17L10.1 11.9L5 10L10.1 8.1L12 3Z" stroke="currentColor" stroke-width="2"/>...';
  }
  if (style === 'store') {
    return '<path d="M4 10H20V20H4V10Z" stroke="currentColor" stroke-width="2"/>...';
  }
  // Default: assistant (chat bubble)
  return '<path d="M21 11.5C21.0034 12.8199..." stroke="currentColor" stroke-width="2"/>...';
};

// Render en el preview
<span 
  className="fluxbot-launcher__icon fluxbot-launcher__icon--chat"
  dangerouslySetInnerHTML={{ __html: getLauncherIconMarkup(avatarStyle) }}
/>
```

#### 3. El preview debe alternar iconos igual que el widget real

```jsx
// Estado del preview debe alternar igual que el widget
const [isPreviewOpen, setIsPreviewOpen] = useState(false);

// En el botón del launcher del preview:
<button
  className={`fluxbot-launcher__button ${isPreviewOpen ? 'fluxbot-launcher--open' : ''}`}
  onClick={() => setIsPreviewOpen(!isPreviewOpen)}
>
  <svg className="fluxbot-launcher__icon fluxbot-launcher__icon--chat" ... />
  <svg className="fluxbot-launcher__icon fluxbot-launcher__icon--close" ... />
</button>
```

#### 4. Aplicar misma animación al chat window del preview

```jsx
// En el modal del preview:
<div 
  className="fluxbot-chat-window"
  style={{
    animation: isPreviewOpen ? 'slideUp 0.3s ease forwards' : 'none',
    // ...
  }}
>
```

### Archivos a modificar para consistencia

| Archivo | Qué cambiar |
|---------|-------------|
| `app.onboarding.tsx` | Estilos CSS del preview, iconos SVG, animaciones |
| `chat-launcher.css` | (referencia, no tocar) |
| `chat-launcher.js` | (referencia, no tocar) |

### Checklist de consistencia visual

Antes de hacer commit, verifica que el preview tenga:

- [ ] Botón de 60x60px con border-radius: 50%
- [ ] Iconos SVG que rotan al abrir/cerrar (no texto)
- [ ] Animación slideUp en la ventana del chat
- [ ] Transición en el label cuando se abre/cierra
- [ ] Misma posición del label (flex-direction: row-reverse para bottom-right)
- [ ] Mismos colores, sombras y spacing

---

## Archivos de Referencia

| Propósito | Archivo |
|-----------|---------|
| Tipos y defaults | `app/services/admin-config.server.ts` |
| Endpoint API | `app/routes/apps.fluxbot.widget-config.ts` |
| Onboarding UI | `app/routes/app.onboarding.tsx` |
| Settings UI | `app/routes/app.widget-settings.tsx` |
| Theme block | `storefront-widget/extensions/chat-widget/blocks/chat_launcher.liquid` |
| Runtime JS | `storefront-widget/extensions/chat-widget/assets/chat-launcher.js` |

---

## Checklist de Verificación

Antes de hacer commit, verifica:

### Configuración del widget:
- [ ] Nueva propiedad agregada a `WidgetBranding` interface
- [ ] Nueva propiedad en `DEFAULT_ADMIN_CONFIG`
- [ ] Nueva propiedad en `extractWidgetBranding()` del widget-config
- [ ] Nueva propiedad visible en onboarding (si aplica)
- [ ] Nueva propiedad visible en widget-settings (si aplica)
- [ ] Valor por defecto igual en admin y JS fallback
- [ ] `chat-launcher.js` aplica valor del admin con prioridad (no del DOM)
- [ ] Tests pasan (`npm test`)

### Consistencia visual (Preview = Widget Real):
- [ ] Botón de launcher: 60x60px con border-radius: 50% (no 999px)
- [ ] Iconos SVG que rotan al abrir/cerrar (no texto como "×" o "AI")
- [ ] Animación slideUp (0.3s) en la ventana del chat
- [ ] Transición/opacity en el label cuando se abre/cierra
- [ ] Misma posición del label (flex-direction: row-reverse para bottom-right)
- [ ] Mismos colores, sombras y spacing que el widget real
