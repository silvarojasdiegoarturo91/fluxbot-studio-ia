# Feature Requirements: Admin Spanish Localization

## Traceability

- Root OpenSpec: `REQ-ROOT-006`
- Shopify OpenSpec: `REQ-IA-SHOPIFY-004`
- Root SpecKit: `specs/002-shopify-admin-spanish-localization/spec.md`

## Requirements

- Spanish admin navigation uses correct accents: `Campañas`, `Analítica`, `Facturación`.
- Visible Spanish admin copy preserves accents, `ñ`, and language-specific orthography.
- Visible customer/admin copy must be re-scanned for unaccented variants such as `campana`, `conversacion`, `conversion`, `Programacion`, `posicion`, `espanol`, `dinamico`, `mision`, `rapido`, and `aqui`.
- Agents must review any new or modified translations before closing work.
- Unit tests protect key Spanish navigation labels from losing accents.

## Test Cases

- `getAdminNavGroups("es")` includes `Campañas`, `Analítica`, and `Facturación`.
- The same navigation output does not include `Campanas`, `Analitica`, or `Facturacion`.
- A textual scan of visible admin routes/components/default widget copy does not leave unaccented Spanish variants for campaign, conversation, conversion, programming, position, Spanish, dynamic, mission, fast, or here.
