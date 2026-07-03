import type { AdminLanguage } from "../services/admin-config.server";

export interface AdminNavItem {
  label: string;
  url: string;
  description: string;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

export interface AdminRouteMeta {
  title: string;
  description: string;
  section: string;
}

const ROUTE_COPY: Record<
  string,
  {
    en: AdminRouteMeta;
    es: AdminRouteMeta;
  }
> = {
  "/app": {
    en: {
      title: "Dashboard",
      description: "Track setup progress, assistant health, business impact, and the next operational priority.",
      section: "Overview",
    },
    es: {
      title: "Panel",
      description: "Sigue el avance del setup, la salud del asistente, el impacto comercial y la siguiente prioridad operativa.",
      section: "Resumen",
    },
  },
  "/app/onboarding": {
    en: {
      title: "Activation",
      description: "Guide merchants through a clear step-by-step assistant activation flow.",
      section: "Activation",
    },
    es: {
      title: "Activación",
      description: "Guía al merchant por una activación clara, paso a paso, del asistente.",
      section: "Activación",
    },
  },
  "/app/settings": {
    en: {
      title: "Assistant",
      description: "Tune the assistant voice, behavior, safeguards, and response defaults.",
      section: "Configure",
    },
    es: {
      title: "Asistente",
      description: "Ajusta la voz, el comportamiento, los guardarrailes y los valores por defecto de respuesta.",
      section: "Configurar",
    },
  },
  "/app/data-sources": {
    en: {
      title: "Data Sources",
      description: "Connect and monitor the catalog, policies, pages, and sync jobs powering the assistant.",
      section: "Configure",
    },
    es: {
      title: "Fuentes de datos",
      description: "Conecta y monitoriza catálogo, políticas, páginas y sincronizaciones que alimentan al asistente.",
      section: "Configurar",
    },
  },
  "/app/campaigns": {
    en: {
      title: "Campaigns",
      description: "Create proactive journeys, activate campaigns, and monitor conversion performance.",
      section: "Growth",
    },
    es: {
      title: "Campañas",
      description: "Crea recorridos proactivos, activa campañas y sigue el rendimiento de conversión.",
      section: "Crecimiento",
    },
  },
  "/app/conversations": {
    en: {
      title: "Conversations",
      description: "Review live traffic, triage escalations, and keep handoffs moving.",
      section: "Support",
    },
    es: {
      title: "Conversaciones",
      description: "Revisa tráfico en vivo, prioriza escalaciones y mantén los handoffs avanzando.",
      section: "Soporte",
    },
  },
  "/app/analytics": {
    en: {
      title: "Analytics",
      description: "Read the metrics that matter for adoption, resolution quality, and assisted revenue.",
      section: "Insights",
    },
    es: {
      title: "Analítica",
      description: "Lee las métricas que importan para adopción, calidad de resolución e ingresos asistidos.",
      section: "Insights",
    },
  },
  "/app/privacy": {
    en: {
      title: "Compliance",
      description: "Manage residency, retention, legal holds, and audit readiness from one place.",
      section: "Risk",
    },
    es: {
      title: "Cumplimiento",
      description: "Gestiona residencia, retención, legal holds y auditoría desde un solo lugar.",
      section: "Riesgo",
    },
  },
  "/app/operations": {
    en: {
      title: "Operations",
      description: "Monitor callback delivery, runtime health, and the operational backlog.",
      section: "Operations",
    },
    es: {
      title: "Operaciones",
      description: "Monitoriza entrega de callbacks, salud runtime y backlog operativo.",
      section: "Operaciones",
    },
  },
  "/app/widget-settings": {
    en: {
      title: "Widget",
      description: "Customize the storefront launcher, welcome copy, and visual defaults.",
      section: "Experience",
    },
    es: {
      title: "Widget",
      description: "Personaliza launcher, mensaje de bienvenida y valores visuales del storefront.",
      section: "Experiencia",
    },
  },
  "/app/widget-publish": {
    en: {
      title: "Widget Publish",
      description: "Validate installation, publishing status, and merchant-facing storefront readiness.",
      section: "Experience",
    },
    es: {
      title: "Publicar widget",
      description: "Valida instalación, estado de publicación y readiness del storefront.",
      section: "Experiencia",
    },
  },
  "/app/llms-status": {
    en: {
      title: "llms.txt",
      description: "Track llms.txt generation, publishing state, and delivery availability.",
      section: "Operations",
    },
    es: {
      title: "llms.txt",
      description: "Sigue generación, publicación y disponibilidad de entrega de llms.txt.",
      section: "Operaciones",
    },
  },
  "/app/billing": {
    en: {
      title: "Billing",
      description: "Review plan status, subscriptions, and the next monetization action.",
      section: "Account",
    },
    es: {
      title: "Facturación",
      description: "Revisa plan, suscripciones y la siguiente acción de monetización.",
      section: "Cuenta",
    },
  },
};

const NAV_ORDER = [
  {
    key: "overview",
    en: "Overview",
    es: "Resumen",
    routes: ["/app", "/app/onboarding"],
  },
  {
    key: "configure",
    en: "Configure",
    es: "Configurar",
    routes: ["/app/settings", "/app/data-sources", "/app/widget-settings", "/app/widget-publish"],
  },
  {
    key: "growth",
    en: "Growth",
    es: "Crecimiento",
    routes: ["/app/campaigns", "/app/analytics", "/app/conversations"],
  },
  {
    key: "operations",
    en: "Operations",
    es: "Operaciones",
    routes: ["/app/operations", "/app/privacy", "/app/llms-status", "/app/billing"],
  },
];

export function getAdminRouteMeta(pathname: string, language: AdminLanguage): AdminRouteMeta {
  return ROUTE_COPY[pathname]?.[language] ?? ROUTE_COPY["/app"][language];
}

export function getAdminNavGroups(language: AdminLanguage, onboardingCompleted: boolean = true): AdminNavGroup[] {
  return NAV_ORDER.map((group) => ({
    title: language === "es" ? group.es : group.en,
    items: group.routes
      .filter((route) => {
        // Hide /app/onboarding from menu if onboarding is already completed
        if (route === "/app/onboarding" && onboardingCompleted) {
          return false;
        }
        return true;
      })
      .map((route) => ({
        label: ROUTE_COPY[route][language].title,
        url: route,
        description: ROUTE_COPY[route][language].description,
      })),
  }));
}
