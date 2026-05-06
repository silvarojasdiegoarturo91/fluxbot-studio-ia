import { Badge } from "@shopify/polaris";
import { useLocation, useNavigation } from "react-router";
import type { ReactNode } from "react";
import type { AdminLanguage } from "../services/admin-config.server";
import { getAdminRouteMeta } from "../utils/admin-navigation";

const ADMIN_SHELL_STYLES = `
.fb-admin-shell {
  min-height: 100vh;
  background: linear-gradient(180deg, #f6f7fb 0%, #f2f4f8 100%);
}

.fb-admin-main {
  min-width: 0;
  padding: 28px 28px 48px;
}

.fb-admin-topbar {
  position: sticky;
  top: 16px;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 20px 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18px);
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.08);
  margin-bottom: 28px;
}

.fb-admin-topbar-eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.74rem;
  font-weight: 700;
  color: #6a7384;
}

.fb-admin-topbar-title {
  margin: 0;
  font-size: clamp(1.2rem, 2vw, 1.55rem);
  line-height: 1.15;
  color: #18212f;
}

.fb-admin-topbar-description {
  margin: 8px 0 0;
  color: #60697a;
  max-width: 760px;
  line-height: 1.5;
}

.fb-admin-topbar-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.fb-admin-loading {
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, #47657f 0%, #6c8dab 50%, #47657f 100%);
  background-size: 200% 100%;
  animation: fbAdminLoading 1.2s linear infinite;
  margin: -10px 0 18px;
}

.fb-admin-content > * {
  min-width: 0;
}

.fb-admin-content {
  display: grid;
  gap: 24px;
}

.fb-admin-page-header {
  margin-bottom: 24px;
  padding: 24px;
  border-radius: 24px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.06);
}

.fb-admin-page-header-inner {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.fb-admin-page-header-eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6a7384;
  font-size: 0.76rem;
  font-weight: 700;
}

.fb-admin-page-header-title {
  margin: 0;
  color: #18212f;
  font-size: clamp(1.45rem, 2vw, 2rem);
  line-height: 1.1;
}

.fb-admin-page-header-description {
  margin: 10px 0 0;
  color: #5f697a;
  line-height: 1.55;
  max-width: 760px;
}

.fb-admin-page-header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
}

.fb-admin-page-header-inner > * {
  min-width: 0;
}

.fb-admin-section-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.fb-admin-section-copy {
  margin-top: 4px;
  color: #687386;
  line-height: 1.5;
}

.fb-admin-card-muted {
  color: #6b7587;
}

.fb-admin-section-card {
  display: grid;
  gap: 18px;
}

.fb-admin-section-body {
  min-width: 0;
}

.fb-admin-stat-card {
  min-height: 140px;
}

.fb-admin-stat-label {
  color: #697386;
  font-size: 0.84rem;
}

.fb-admin-stat-value {
  font-size: clamp(1.5rem, 2.2vw, 2rem);
  font-weight: 700;
  color: #18212f;
  line-height: 1.1;
}

.fb-admin-stat-meta {
  color: #6a7485;
  font-size: 0.9rem;
}

.fb-admin-info-callout {
  border: 1px solid rgba(71, 101, 127, 0.14);
  border-radius: 18px;
  padding: 16px 18px;
  background: linear-gradient(180deg, rgba(71, 101, 127, 0.05) 0%, rgba(71, 101, 127, 0.02) 100%);
}

.fb-admin-info-callout-highlight {
  border-color: rgba(71, 101, 127, 0.2);
  background: linear-gradient(180deg, rgba(71, 101, 127, 0.1) 0%, rgba(71, 101, 127, 0.04) 100%);
}

.fb-admin-info-callout-copy {
  color: #5f697a;
  line-height: 1.6;
}

.fb-admin-form-footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

@keyframes fbAdminLoading {
  from { background-position: 200% 0; }
  to { background-position: 0 0; }
}

@media (max-width: 1100px) {
}

@media (max-width: 768px) {
  .fb-admin-main {
    padding: 16px;
  }

  .fb-admin-topbar,
  .fb-admin-page-header-inner,
  .fb-admin-section-header,
  .fb-admin-form-footer {
    flex-direction: column;
  }

  .fb-admin-topbar {
    top: 8px;
    padding: 16px;
  }

  .fb-admin-page-header {
    padding: 18px;
  }

  .fb-admin-topbar-chips {
    justify-content: flex-start;
  }
}
`;

export function AdminShell(props: {
  adminLanguage: AdminLanguage;
  storeDomain?: string | null;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigation = useNavigation();
  const routeMeta = getAdminRouteMeta(location.pathname, props.adminLanguage);

  return (
    <>
      <style>{ADMIN_SHELL_STYLES}</style>
      <div className="fb-admin-shell">
        <main className="fb-admin-main">
          <div className="fb-admin-topbar">
            <div>
              <p className="fb-admin-topbar-eyebrow">{routeMeta.section}</p>
              <h1 className="fb-admin-topbar-title">{routeMeta.title}</h1>
              <p className="fb-admin-topbar-description">{routeMeta.description}</p>
            </div>

            <div className="fb-admin-topbar-chips">
              <Badge tone="info">{props.storeDomain || "shop"}</Badge>
              <Badge tone="success">{props.adminLanguage === "es" ? "Admin listo" : "Admin ready"}</Badge>
              <Badge tone={navigation.state === "idle" ? "success" : "attention"}>
                {navigation.state === "idle"
                  ? props.adminLanguage === "es" ? "Sin cambios pendientes" : "All changes synced"
                  : props.adminLanguage === "es" ? "Actualizando..." : "Updating..."}
              </Badge>
            </div>
          </div>

          {navigation.state !== "idle" ? <div className="fb-admin-loading" /> : null}

          <div className="fb-admin-content">{props.children}</div>
        </main>
      </div>
    </>
  );
}
