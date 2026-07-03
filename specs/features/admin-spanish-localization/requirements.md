# Feature Requirements: Admin Spanish Localization

## Traceability

- Root OpenSpec: `REQ-ROOT-006`
- Shopify OpenSpec: `REQ-IA-SHOPIFY-004`
- Root SpecKit: `specs/002-shopify-admin-spanish-localization/spec.md`

## Requirements

- Spanish admin navigation uses correct accents: `Campañas`, `Analítica`, `Facturación`.
- Visible Spanish admin copy preserves accents, `ñ`, and language-specific orthography.
- Agents must review any new or modified translations before closing work.
- Unit tests protect key Spanish navigation labels from losing accents.

## Test Cases

- `getAdminNavGroups("es")` includes `Campañas`, `Analítica`, and `Facturación`.
- The same navigation output does not include `Campanas`, `Analitica`, or `Facturacion`.
