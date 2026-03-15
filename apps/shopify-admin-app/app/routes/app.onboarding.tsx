import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  ProgressBar,
  Button,
  InlineStack,
  Select,
  TextField,
  FormLayout,
  List,
  Banner,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AdminLanguage,
  type BotGoal,
  type BotTone,
  type ResponseStyle,
  getMerchantAdminConfig,
  saveMerchantAdminConfig,
} from "../services/admin-config.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticate } from "../shopify.server";

type OnboardingIntent = "back" | "save_only" | "save_continue" | "complete";

interface OnboardingActionData {
  ok: boolean;
  message?: string;
  error?: string;
}

const TOTAL_STEPS = 7;

const ONBOARDING_COPY = {
  es: {
    title: "Onboarding inicial",
    subtitle: "Configura tu asistente IA en pocos minutos",
    stepLabel: "Paso",
    progressLabel: "Progreso",
    saveDraft: "Guardar progreso",
    back: "Volver",
    next: "Continuar",
    complete: "Activar asistente",
    welcomeTitle: "Bienvenido",
    welcomeText:
      "Vamos a dejar tu chatbot listo para ventas y soporte sin configuraciones tecnicas complejas.",
    welcomeBullets: [
      "Definir idioma global del asistente",
      "Configurar nombre, tono y objetivo",
      "Activar capacidades iniciales",
      "Personalizar apariencia base del widget",
    ],
    languageTitle: "Idioma global",
    profileTitle: "Perfil del asistente",
    capabilitiesTitle: "Capacidades iniciales",
    brandingTitle: "Apariencia inicial",
    reviewTitle: "Revision final",
    activateTitle: "Activacion",
    reviewText: "Revisa la configuracion antes de activar.",
    activateText:
      "Al activar, el merchant podra seguir optimizando desde el dashboard principal.",
    activatedMessage: "Onboarding completado. Tu asistente esta listo.",
  },
  en: {
    title: "Initial onboarding",
    subtitle: "Set up your AI assistant in a few minutes",
    stepLabel: "Step",
    progressLabel: "Progress",
    saveDraft: "Save progress",
    back: "Back",
    next: "Continue",
    complete: "Activate assistant",
    welcomeTitle: "Welcome",
    welcomeText:
      "We will configure your chatbot for sales and support without exposing technical complexity.",
    welcomeBullets: [
      "Choose a single global language",
      "Define name, tone and primary goal",
      "Enable initial capabilities",
      "Set widget branding basics",
    ],
    languageTitle: "Global language",
    profileTitle: "Assistant profile",
    capabilitiesTitle: "Initial capabilities",
    brandingTitle: "Branding basics",
    reviewTitle: "Final review",
    activateTitle: "Activation",
    reviewText: "Review your setup before activation.",
    activateText:
      "After activation, merchants can keep optimizing from the main dashboard.",
    activatedMessage: "Onboarding complete. Your assistant is ready.",
  },
} as const;

const ONBOARDING_STYLES = `
.onb-shell {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding-bottom: 24px;
  --onb-accent: #47657f;
  --onb-accent-soft: #dde7ef;
  --onb-ink: #232833;
  --onb-bg: #f7f1e9;
  --onb-warm: #d79a5a;
  --onb-border: #ddd2c4;
  --onb-muted: #786d63;
}

.onb-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -3;
  background:
    radial-gradient(1100px 500px at 20% -20%, #e5edf3 0%, transparent 60%),
    radial-gradient(1000px 520px at 100% 0%, #f6e3c9 0%, transparent 58%),
    linear-gradient(180deg, #fbf7f1 0%, #f4ede4 100%);
}

.onb-orb {
  position: absolute;
  border-radius: 999px;
  z-index: -2;
  opacity: 0.45;
  filter: blur(2px);
  animation: onbFloat 14s ease-in-out infinite;
}

.onb-orb-1 {
  width: 260px;
  height: 260px;
  right: -80px;
  top: 130px;
  background: #e6bb86;
}

.onb-orb-2 {
  width: 220px;
  height: 220px;
  left: -70px;
  bottom: 90px;
  background: #a6bbcf;
  animation-delay: 1.8s;
}

.onb-hero {
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  gap: 16px;
  align-items: stretch;
}

.onb-hero-card,
.onb-progress-card {
  border: 1px solid var(--onb-border);
  border-radius: 18px;
  background: rgba(255, 251, 246, 0.88);
  box-shadow: 0 12px 26px rgba(70, 48, 24, 0.08);
  padding: 18px;
  animation: onbFadeUp 520ms ease both;
}

.onb-kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--onb-accent);
  font-family: "Avenir Next", "Trebuchet MS", sans-serif;
}

.onb-title {
  margin: 4px 0 8px;
  color: var(--onb-ink);
  font-family: "Avenir Next", "Gill Sans", sans-serif;
  font-size: clamp(1.5rem, 2.2vw, 2rem);
  line-height: 1.1;
}

.onb-subtitle {
  margin: 0;
  color: #665b50;
  font-family: "Nunito Sans", "Helvetica Neue", sans-serif;
  font-size: 0.95rem;
}

.onb-progress-title {
  margin: 0 0 8px;
  color: var(--onb-muted);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.onb-progress-value {
  margin: 0;
  color: var(--onb-ink);
  font-size: clamp(1.45rem, 2.2vw, 1.9rem);
  font-family: "Avenir Next", "Trebuchet MS", sans-serif;
}

.onb-progress-hint {
  margin: 6px 0 0;
  color: #74675c;
  font-size: 0.86rem;
}

.onb-content-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.48fr);
  gap: 14px;
  align-items: start;
}

.onb-content-column {
  display: grid;
  gap: 16px;
}

.onb-section-track {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.onb-section-card {
  border: 1px solid #ddd2c5;
  border-radius: 14px;
  background: #fffdfa;
  padding: 12px;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

.onb-section-card-active {
  border-color: #9eb5c9;
  background: linear-gradient(180deg, #f4f7fa 0%, #edf3f7 100%);
  box-shadow: inset 0 0 0 1px #d7e2ea;
}

.onb-section-card-done {
  border-color: #d9c7b1;
  background: #fcf6ef;
}

.onb-section-card:hover {
  transform: translateY(-1px);
}

.onb-section-kicker {
  margin: 0;
  color: var(--onb-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  font-size: 0.68rem;
}

.onb-section-title {
  margin: 4px 0 8px;
  color: #2f3641;
  font-weight: 700;
  font-size: 0.88rem;
}

.onb-section-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.onb-section-percent {
  margin: 0;
  color: var(--onb-accent);
  font-size: 0.8rem;
  font-weight: 700;
}

.onb-section-status {
  margin: 0;
  color: #7a6f65;
  font-size: 0.72rem;
}

.onb-step-track {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.onb-step-pill {
  border: 1px solid var(--onb-border);
  border-radius: 12px;
  background: #ffffff;
  padding: 10px 8px;
  min-height: 66px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  animation: onbFadeUp 480ms ease both;
  cursor: pointer;
  transition: all 180ms ease;
}

.onb-step-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.onb-step-pill-current {
  border-color: var(--onb-accent);
  background: linear-gradient(180deg, #f3f7fa 0%, #ebf1f5 100%);
  box-shadow: inset 0 0 0 1px #d6e1e9;
}

.onb-step-pill-done {
  border-color: #d9c8b4;
  background: #faf4ec;
}

.onb-step-index {
  display: inline-flex;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  align-items: center;
  justify-content: center;
  font-size: 0.74rem;
  font-weight: 700;
  color: #ffffff;
  background: var(--onb-accent);
}

.onb-step-pill-done .onb-step-index {
  background: #b88e5d;
}

.onb-step-label {
  color: #38414d;
  font-size: 0.76rem;
  line-height: 1.2;
  font-family: "Nunito Sans", "Helvetica Neue", sans-serif;
}

.onb-form-card {
  border: 1px solid var(--onb-border);
  border-radius: 18px;
  background: rgba(255, 251, 246, 0.94);
  padding: 14px;
}

.onb-preview-slot {
  width: 100%;
}

.onb-preview-card {
  border: 1px solid #d7cdbf;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8f2ea 0%, #f2e9de 100%);
  padding: 12px;
  box-shadow: 0 10px 18px rgba(70, 48, 24, 0.08);
  display: flex;
  flex-direction: column;
  height: 560px;
}

.onb-preview-kicker {
  margin: 0 0 10px 0;
  font-size: 0.7rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #7b6e63;
  font-weight: 700;
}

.onb-preview-stage {
  position: relative;
  flex: 1;
  border-radius: 14px;
  border: 1px solid #384053;
  padding: 14px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 34px),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 34px),
    radial-gradient(circle at 68% 0%, rgba(240, 180, 54, 0.36) 0%, transparent 42%),
    radial-gradient(circle at 100% 100%, rgba(95, 103, 255, 0.52) 0%, transparent 44%),
    linear-gradient(160deg, #232730 0%, #1a1c22 100%);
}

.onb-preview-modal {
  position: absolute;
  bottom: 84px;
  width: min(340px, calc(100% - 28px));
  height: min(520px, calc(100% - 96px));
  border-radius: 14px;
  border: 1px solid #d0d5da;
  background: #f0f2f4;
  box-shadow: 0 14px 28px rgba(7, 10, 18, 0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.onb-preview-modal-left {
  left: 14px;
}

.onb-preview-modal-right {
  right: 14px;
}

.onb-runtime-launcher {
  position: absolute;
  bottom: 14px;
  z-index: 2;
}

.onb-runtime-launcher-left {
  left: 14px;
}

.onb-runtime-launcher-right {
  right: 14px;
}

.onb-runtime-launcher-button {
  width: 58px;
  height: 58px;
  border-radius: 999px;
  border: none;
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(5, 7, 12, 0.42);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  padding: 0;
}

.onb-runtime-launcher-button:hover {
  transform: scale(1.04);
  box-shadow: 0 12px 24px rgba(5, 7, 12, 0.52);
}

.onb-runtime-launcher-button:active {
  transform: scale(0.95);
}

.onb-runtime-launcher-button:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

.onb-runtime-launcher-icon {
  font-size: 0.84rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
}

.onb-preview-caption {
  margin: 10px 0 0;
  color: #7b6e63;
  font-size: 0.74rem;
  text-align: center;
}

.onb-step-frame {
  border: 1px solid #ddd1c4;
  border-radius: 16px;
  background:
    linear-gradient(160deg, rgba(255, 250, 243, 0.98) 0%, rgba(246, 238, 228, 0.94) 100%);
  padding: 16px;
  overflow: hidden;
  will-change: transform, opacity;
}

.onb-step-frame-neutral {
  animation: onbStepIn 420ms ease both;
}

.onb-step-frame-forward {
  animation: onbStepForwardIn 420ms cubic-bezier(0.2, 0.78, 0.2, 1) both;
}

.onb-step-frame-backward {
  animation: onbStepBackwardIn 420ms cubic-bezier(0.2, 0.78, 0.2, 1) both;
}

.onb-step-headline {
  margin: 0;
  color: var(--onb-ink);
  font-family: "Avenir Next", "Gill Sans", sans-serif;
}

.onb-step-copy {
  margin: 0;
  color: #64584d;
  font-size: 0.92rem;
}

.onb-note-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.onb-note-card {
  border: 1px dashed #d9c6b1;
  border-radius: 12px;
  background: #fffaf2;
  padding: 10px;
}

.onb-note-title {
  margin: 0;
  font-weight: 700;
  color: #39424d;
  font-size: 0.82rem;
}

.onb-note-text {
  margin: 4px 0 0;
  color: #6a5f54;
  font-size: 0.8rem;
}

.onb-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.onb-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 0.74rem;
  border: 1px solid;
}

.onb-chip-on {
  border-color: #bfd0dc;
  background: #eef4f8;
  color: #425d74;
}

.onb-chip-off {
  border-color: #ddd3c9;
  background: #faf6f1;
  color: #6d635a;
}

.onb-widget-preview {
  border: 1px solid #d7cabc;
  border-radius: 14px;
  background: #fff9f2;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.onb-widget-preview-launcher {
  min-height: 50px;
  justify-content: space-between;
}

.onb-widget-preview-launcher.onb-launcher-right {
  flex-direction: row-reverse;
}

.onb-widget-preview-launcher .onb-widget-copy {
  flex: 1;
}

.onb-widget-preview-launcher.onb-launcher-right .onb-widget-copy {
  text-align: right;
}

.onb-widget-dot {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  box-shadow: 0 0 0 5px rgba(71, 101, 127, 0.14);
  animation: onbPulse 2.4s ease-in-out infinite;
}

.onb-widget-copy {
  margin: 0;
  color: #685c52;
  font-size: 0.82rem;
}

.onb-mock-chat {
  border: 0;
  border-radius: 0;
  background: #f3f4f6;
  box-shadow: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
}

.onb-mock-chat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px 9px;
  border-bottom: 1px solid #d8dde2;
  background: #e6eaed;
  flex-shrink: 0;
}

.onb-mock-chat-close {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.onb-mock-chat-close:hover {
  background: rgba(255, 255, 255, 0.18);
}

.onb-mock-chat-title {
  margin: 0;
  font-size: 0.92rem;
  color: #2f3338;
  font-weight: 700;
}

.onb-mock-chat-subtitle {
  margin: 2px 0 0;
  font-size: 0.72rem;
  color: #59616a;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.onb-mock-chat-subtitle::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #1d9a53;
}

.onb-mock-chat-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  background: #f3f4f6;
}

.onb-chat-day-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #808890;
  font-size: 0.7rem;
  margin-bottom: 2px;
}

.onb-chat-day-divider::before,
.onb-chat-day-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #d6d9de;
}

.onb-chat-row {
  display: flex;
}

.onb-chat-row-user {
  justify-content: flex-end;
}

.onb-chat-row-bot {
  justify-content: flex-start;
}

.onb-chat-bubble {
  max-width: 80%;
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 0.78rem;
  line-height: 1.35;
  font-family: "Nunito Sans", "Helvetica Neue", sans-serif;
}

.onb-chat-bubble-user {
  color: #26435a;
  background: #e5eef5;
  border: 1px solid #cad9e5;
}

.onb-chat-bubble-bot {
  color: #54483d;
  background: #fffaf4;
  border: 1px solid #e2d8cc;
}

.onb-mock-product {
  border: 1px solid #ddd0c3;
  border-radius: 12px;
  padding: 10px;
  background: #fffdf9;
  display: grid;
  gap: 4px;
}

.onb-mock-product-title {
  margin: 0;
  color: #37404c;
  font-size: 0.8rem;
  font-weight: 700;
}

.onb-mock-product-meta {
  margin: 0;
  color: #76695e;
  font-size: 0.74rem;
}

.onb-mock-product-cta {
  margin: 4px 0 0;
  color: #0f766e;
  font-size: 0.73rem;
  font-weight: 700;
}

.onb-quick-replies {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.onb-quick-reply {
  display: inline-flex;
  border: 1px solid #d6ccbf;
  background: #f6efe7;
  color: #62584d;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 0.7rem;
}

.onb-chat-composer {
  margin: 10px;
  border: 1px solid #d9dde2;
  background: #e8eaee;
  border-radius: 10px;
  min-height: 38px;
  padding: 0 7px 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #7b838c;
  font-size: 0.74rem;
  flex-shrink: 0;
}

.onb-chat-send {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #2f3338;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.74rem;
  font-weight: 700;
}

.onb-nav-row {
  border-top: 1px solid #ddd2c5;
  padding-top: 14px;
}

@keyframes onbFadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes onbStepIn {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes onbStepForwardIn {
  from {
    opacity: 0;
    transform: translateX(26px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes onbStepBackwardIn {
  from {
    opacity: 0;
    transform: translateX(-26px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes onbFloat {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-16px);
  }
}

@keyframes onbPulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.12);
  }
}

@media (max-width: 64em) {
  .onb-content-stage {
    grid-template-columns: 1fr;
  }

  .onb-section-track {
    grid-template-columns: 1fr;
  }

  .onb-step-track {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .onb-preview-modal {
    width: min(100%, 380px);
  }
}

@media (max-width: 48em) {
  .onb-hero {
    grid-template-columns: 1fr;
  }

  .onb-step-track {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .onb-note-grid {
    grid-template-columns: 1fr;
  }

  .onb-chat-bubble {
    max-width: 94%;
  }

  .onb-preview-card {
    padding: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .onb-shell * {
    animation: none !important;
    transition: none !important;
  }
}
`;

function parseStep(url: URL): number {
  const raw = Number(url.searchParams.get("step") || "1");
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(TOTAL_STEPS, Math.floor(raw)));
}

function parseBoolean(raw: FormDataEntryValue | null, fallback: boolean): boolean {
  if (raw === null || raw === undefined) return fallback;
  const value = String(raw).trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

function parseAdminLanguage(raw: FormDataEntryValue | null, fallback: AdminLanguage): AdminLanguage {
  const value = String(raw || "").trim().toLowerCase();
  return value === "es" || value === "en" ? value : fallback;
}

function parseBotGoal(raw: FormDataEntryValue | null, fallback: BotGoal): BotGoal {
  const value = String(raw || "").trim().toUpperCase();
  return value === "SALES" || value === "SUPPORT" || value === "SALES_SUPPORT" ? value : fallback;
}

function parseBotTone(raw: FormDataEntryValue | null, fallback: BotTone): BotTone {
  const value = String(raw || "").trim();
  return value === "professional" || value === "friendly" || value === "concise" || value === "sales"
    ? value
    : fallback;
}

function parseResponseStyle(raw: FormDataEntryValue | null, fallback: ResponseStyle): ResponseStyle {
  const value = String(raw || "").trim().toUpperCase();
  return value === "CONCISE" || value === "BALANCED" || value === "DETAILED" ? value : fallback;
}

function buildRedirectPath(basePath: string, url: URL, step?: number, extraParams?: Record<string, string>) {
  const params = new URLSearchParams(url.search);
  params.delete("step");
  params.delete("saved");
  params.delete("onboarding");

  if (typeof step === "number") {
    params.set("step", String(step));
  }

  Object.entries(extraParams || {}).forEach(([key, value]) => {
    params.set(key, value);
  });

  const queryString = params.toString();
  return `${basePath}${queryString ? `?${queryString}` : ""}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const url = new URL(request.url);
  const step = parseStep(url);
  const config = await getMerchantAdminConfig(shop.id);

  const adminLanguage = config.adminLanguage;
  const copy = ONBOARDING_COPY[adminLanguage];

  return {
    shop,
    step,
    totalSteps: TOTAL_STEPS,
    config,
    copy,
  };
}

export async function action({ request }: ActionFunctionArgs): Promise<Response | OnboardingActionData> {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }

  const { session } = await authenticate.admin(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop not found" };
  }

  const currentConfig = await getMerchantAdminConfig(shop.id);
  const formData = await request.formData();
  const requestUrl = new URL(request.url);

  const currentStep = parseStep(requestUrl);
  const intent = String(formData.get("intent") || "save_only") as OnboardingIntent;

  const globalLanguage = parseAdminLanguage(formData.get("adminLanguage"), currentConfig.adminLanguage);
  const adminLanguage = globalLanguage;
  const primaryBotLanguage = globalLanguage;
  const supportedLanguages = [globalLanguage];

  const botName = String(formData.get("botName") || currentConfig.botName).trim();
  const botTone = parseBotTone(formData.get("botTone"), currentConfig.botTone);
  const botGoal = parseBotGoal(formData.get("botGoal"), currentConfig.botGoal);
  const responseStyle = parseResponseStyle(formData.get("responseStyle"), currentConfig.responseStyle);
  const welcomeMessage = String(formData.get("welcomeMessage") || currentConfig.welcomeMessage).trim();

  const answerProducts = parseBoolean(
    formData.get("answerProducts"),
    currentConfig.enabledCapabilities.answerProducts,
  );
  const answerPolicies = parseBoolean(
    formData.get("answerPolicies"),
    currentConfig.enabledCapabilities.answerPolicies,
  );
  const answerOrders = parseBoolean(formData.get("answerOrders"), currentConfig.enabledCapabilities.answerOrders);
  const recommendProducts = parseBoolean(
    formData.get("recommendProducts"),
    currentConfig.enabledCapabilities.recommendProducts,
  );
  const captureLeads = parseBoolean(formData.get("captureLeads"), currentConfig.enabledCapabilities.captureLeads);

  const primaryColor = String(formData.get("primaryColor") || currentConfig.widgetBranding.primaryColor).trim();
  const launcherPositionRaw = String(
    formData.get("launcherPosition") || currentConfig.widgetBranding.launcherPosition,
  ).trim();
  const launcherPosition = launcherPositionRaw === "bottom-left" ? "bottom-left" : "bottom-right";

  const avatarStyleRaw = String(formData.get("avatarStyle") || currentConfig.widgetBranding.avatarStyle).trim();
  const avatarStyle =
    avatarStyleRaw === "spark" || avatarStyleRaw === "store" || avatarStyleRaw === "assistant"
      ? avatarStyleRaw
      : "assistant";

  const launcherLabel = String(formData.get("launcherLabel") || currentConfig.widgetBranding.launcherLabel).trim();

  if (!botName) {
    return { ok: false, error: adminLanguage === "es" ? "El nombre del chatbot es obligatorio." : "Bot name is required." };
  }

  if (!welcomeMessage) {
    return {
      ok: false,
      error: adminLanguage === "es"
        ? "El mensaje de bienvenida es obligatorio."
        : "Welcome message is required.",
    };
  }

  let nextStep = currentStep;
  if (intent === "save_continue") {
    nextStep = Math.min(TOTAL_STEPS, currentStep + 1);
  } else if (intent === "back") {
    nextStep = Math.max(1, currentStep - 1);
  }

  const onboardingCompleted = intent === "complete" ? true : currentConfig.onboardingCompleted;

  await saveMerchantAdminConfig(shop.id, {
    adminLanguage,
    primaryBotLanguage,
    supportedLanguages,
    botName,
    botTone,
    botGoal,
    responseStyle,
    welcomeMessage,
    enabledCapabilities: {
      answerProducts,
      answerPolicies,
      answerOrders,
      recommendProducts,
      captureLeads,
    },
    widgetBranding: {
      primaryColor: primaryColor || "#008060",
      launcherPosition,
      avatarStyle,
      launcherLabel: launcherLabel || (adminLanguage === "es" ? "Asistente" : "Assistant"),
    },
    onboardingStep: onboardingCompleted ? TOTAL_STEPS : nextStep,
    onboardingCompleted,
  });

  if (intent === "complete") {
    throw redirect(buildRedirectPath("/app", requestUrl, undefined, { onboarding: "done" }));
  }

  throw redirect(buildRedirectPath("/app/onboarding", requestUrl, nextStep, { saved: "1" }));
}

function HiddenOnboardingInputs(props: {
  adminLanguage: AdminLanguage;
  botName: string;
  botTone: BotTone;
  botGoal: BotGoal;
  responseStyle: ResponseStyle;
  welcomeMessage: string;
  answerProducts: boolean;
  answerPolicies: boolean;
  answerOrders: boolean;
  recommendProducts: boolean;
  captureLeads: boolean;
  primaryColor: string;
  launcherPosition: "bottom-right" | "bottom-left";
  avatarStyle: "assistant" | "spark" | "store";
  launcherLabel: string;
}) {
  return (
    <>
      <input type="hidden" name="adminLanguage" value={props.adminLanguage} />
      <input type="hidden" name="botName" value={props.botName} />
      <input type="hidden" name="botTone" value={props.botTone} />
      <input type="hidden" name="botGoal" value={props.botGoal} />
      <input type="hidden" name="responseStyle" value={props.responseStyle} />
      <input type="hidden" name="welcomeMessage" value={props.welcomeMessage} />
      <input type="hidden" name="answerProducts" value={String(props.answerProducts)} />
      <input type="hidden" name="answerPolicies" value={String(props.answerPolicies)} />
      <input type="hidden" name="answerOrders" value={String(props.answerOrders)} />
      <input type="hidden" name="recommendProducts" value={String(props.recommendProducts)} />
      <input type="hidden" name="captureLeads" value={String(props.captureLeads)} />
      <input type="hidden" name="primaryColor" value={props.primaryColor} />
      <input type="hidden" name="launcherPosition" value={props.launcherPosition} />
      <input type="hidden" name="avatarStyle" value={props.avatarStyle} />
      <input type="hidden" name="launcherLabel" value={props.launcherLabel} />
    </>
  );
}

export default function OnboardingPage() {
  const { step, totalSteps, config, copy } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const showSectionSummaryCards = config.onboardingCompleted;

  const [adminLanguage, setAdminLanguage] = useState<AdminLanguage>(config.adminLanguage);
  const [botName, setBotName] = useState(config.botName);
  const [botTone, setBotTone] = useState<BotTone>(config.botTone);
  const [botGoal, setBotGoal] = useState<BotGoal>(config.botGoal);
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>(config.responseStyle);
  const [welcomeMessage, setWelcomeMessage] = useState(config.welcomeMessage);

  const [answerProducts, setAnswerProducts] = useState(config.enabledCapabilities.answerProducts ? "true" : "false");
  const [answerPolicies, setAnswerPolicies] = useState(config.enabledCapabilities.answerPolicies ? "true" : "false");
  const [answerOrders, setAnswerOrders] = useState(config.enabledCapabilities.answerOrders ? "true" : "false");
  const [recommendProducts, setRecommendProducts] = useState(
    config.enabledCapabilities.recommendProducts ? "true" : "false",
  );
  const [captureLeads, setCaptureLeads] = useState(config.enabledCapabilities.captureLeads ? "true" : "false");

  const [primaryColor, setPrimaryColor] = useState(config.widgetBranding.primaryColor);
  const [launcherPosition, setLauncherPosition] = useState<"bottom-right" | "bottom-left">(
    config.widgetBranding.launcherPosition,
  );
  const [avatarStyle, setAvatarStyle] = useState<"assistant" | "spark" | "store">(
    config.widgetBranding.avatarStyle,
  );
  const [launcherLabel, setLauncherLabel] = useState(config.widgetBranding.launcherLabel);
  const [isPreviewChatOpen, setIsPreviewChatOpen] = useState(false);
  const intentInputRef = useRef<HTMLInputElement>(null);

  const setIntent = (intent: OnboardingIntent) => {
    if (intentInputRef.current) {
      intentInputRef.current.value = intent;
    }
  };

  useEffect(() => {
    setAdminLanguage(config.adminLanguage);
    setBotName(config.botName);
    setBotTone(config.botTone);
    setBotGoal(config.botGoal);
    setResponseStyle(config.responseStyle);
    setWelcomeMessage(config.welcomeMessage);
    setAnswerProducts(config.enabledCapabilities.answerProducts ? "true" : "false");
    setAnswerPolicies(config.enabledCapabilities.answerPolicies ? "true" : "false");
    setAnswerOrders(config.enabledCapabilities.answerOrders ? "true" : "false");
    setRecommendProducts(config.enabledCapabilities.recommendProducts ? "true" : "false");
    setCaptureLeads(config.enabledCapabilities.captureLeads ? "true" : "false");
    setPrimaryColor(config.widgetBranding.primaryColor);
    setLauncherPosition(config.widgetBranding.launcherPosition);
    setAvatarStyle(config.widgetBranding.avatarStyle);
    setLauncherLabel(config.widgetBranding.launcherLabel);
  }, [config]);

  const isSubmitting = navigation.state === "submitting";
  const progress = useMemo(() => Math.round((step / totalSteps) * 100), [step, totalSteps]);
  const previousStepRef = useRef(step);
  const formRef = useRef<HTMLFormElement>(null);
  const [stepDirection, setStepDirection] = useState<"forward" | "backward" | "neutral">("neutral");

  useEffect(() => {
    const previous = previousStepRef.current;
    if (step > previous) {
      setStepDirection("forward");
    } else if (step < previous) {
      setStepDirection("backward");
    } else {
      setStepDirection("neutral");
    }
    previousStepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (step === 5) {
      setIsPreviewChatOpen(false);
    }
  }, [step]);

  const handleStepClick = (targetStep: number) => {
    if (targetStep === step) return;
    setIntent("save_only");
    if (formRef.current) {
      const url = new URL(window.location.href);
      url.searchParams.set("step", String(targetStep));
      // Navigate with the current form data
      const formData = new FormData(formRef.current);
      formData.set("intent", "save_only");
      
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url.toString(), true);
      xhr.onload = () => {
        // Reload page to get new step data
        window.location.href = url.toString();
      };
      xhr.send(formData);
    }
  };

  // Auto-save with debounce when user changes input values
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    // Clear previous timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      if (formRef.current && !isSubmitting) {
        const formData = new FormData(formRef.current);
        formData.set("intent", "save_only");
        
        const xhr = new XMLHttpRequest();
        xhr.open("POST", window.location.href, true);
        xhr.send(formData);
      }
    }, 1500); // Auto-save after 1.5 seconds of no changes

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [botName, botTone, botGoal, welcomeMessage, responseStyle, answerProducts, answerPolicies, answerOrders, recommendProducts, captureLeads, primaryColor, launcherPosition, avatarStyle, launcherLabel, isSubmitting]);

  const stepTitles = [
    copy.languageTitle,
    copy.welcomeTitle,
    copy.profileTitle,
    copy.capabilitiesTitle,
    copy.brandingTitle,
    copy.reviewTitle,
    copy.activateTitle,
  ];

  const sectionProgress = [
    {
      key: "foundation",
      title: adminLanguage === "es" ? "Fundacion" : "Foundation",
      label: adminLanguage === "es" ? "Idioma y contexto" : "Language and context",
      start: 1,
      end: 2,
    },
    {
      key: "assistant",
      title: adminLanguage === "es" ? "Asistente" : "Assistant",
      label: adminLanguage === "es" ? "Perfil y capacidades" : "Profile and capabilities",
      start: 3,
      end: 4,
    },
    {
      key: "launch",
      title: adminLanguage === "es" ? "Lanzamiento" : "Launch",
      label: adminLanguage === "es" ? "Branding y activacion" : "Branding and activation",
      start: 5,
      end: 7,
    },
  ].map((section) => {
    const totalSectionSteps = section.end - section.start + 1;
    const completedSteps = Math.max(0, Math.min(totalSectionSteps, step - section.start + 1));
    const percent = Math.round((completedSteps / totalSectionSteps) * 100);
    const status = percent === 100 ? "done" : percent > 0 ? "active" : "todo";
    const statusLabel = status === "done"
      ? adminLanguage === "es" ? "Completado" : "Completed"
      : status === "active"
        ? adminLanguage === "es" ? "En curso" : "In progress"
        : adminLanguage === "es" ? "Pendiente" : "Pending";

    return {
      ...section,
      percent,
      status,
      statusLabel,
      completedSteps,
      totalSectionSteps,
    };
  });

  const tonePreview = {
    professional: adminLanguage === "es"
      ? "Suena experto y calmado. Ideal para marcas premium y B2B."
      : "Expert and calm. Great for premium and B2B brands.",
    friendly: adminLanguage === "es"
      ? "Conversacional y cercano. Bueno para retail y lifestyle."
      : "Warm and conversational. Great for retail and lifestyle.",
    concise: adminLanguage === "es"
      ? "Directo y rapido. Perfecto cuando el usuario quiere resolver en segundos."
      : "Direct and fast. Perfect when users want instant answers.",
    sales: adminLanguage === "es"
      ? "Persuasivo con foco comercial. Ideal para upsell y conversion."
      : "Persuasive and commerce-focused. Ideal for upsells and conversion.",
  } as const;

  const capabilitySummary = [
    {
      label: adminLanguage === "es" ? "Productos" : "Products",
      enabled: answerProducts === "true",
    },
    {
      label: adminLanguage === "es" ? "Politicas" : "Policies",
      enabled: answerPolicies === "true",
    },
    {
      label: adminLanguage === "es" ? "Pedidos" : "Orders",
      enabled: answerOrders === "true",
    },
    {
      label: adminLanguage === "es" ? "Recomendaciones" : "Recommendations",
      enabled: recommendProducts === "true",
    },
    {
      label: adminLanguage === "es" ? "Leads" : "Leads",
      enabled: captureLeads === "true",
    },
  ];

  const previewUserMessage = adminLanguage === "es"
    ? "Busco una chaqueta ligera para clima templado, menos de 90 EUR."
    : "I need a lightweight jacket for mild weather under 90 EUR.";

  const previewAssistantMessage = useMemo(() => {
    if (!answerProducts || answerProducts === "false") {
      return adminLanguage === "es"
        ? "Ahora mismo la recomendacion de productos esta desactivada. Puedo ayudarte con politicas y soporte si lo prefieres."
        : "Product recommendations are currently disabled. I can still help with policy and support questions.";
    }

    const conciseTone = {
      es: "Te recomiendo Flux Shell Lite (€79): transpirable, liviana y con ajuste regular.",
      en: "Try Flux Shell Lite (€79): breathable, lightweight, regular fit.",
    };

    const balancedTone = {
      es: "Te recomendaria Flux Shell Lite (€79). Es ligera, transpirable y funciona muy bien para clima templado sin superar tu presupuesto.",
      en: "I would recommend Flux Shell Lite (€79). It is lightweight, breathable, and a strong fit for mild weather within budget.",
    };

    const detailedTone = {
      es: "Segun tu presupuesto y uso, Flux Shell Lite (€79) encaja muy bien: tejido ligero, buena ventilacion y corte versatil para uso diario. Si quieres, te comparo una opcion premium antes de decidir.",
      en: "Based on your budget and use case, Flux Shell Lite (€79) is a strong match: lightweight fabric, good airflow, and a versatile everyday fit. I can also compare one premium option before you decide.",
    };

    const salesBoost = {
      es: " Si activas packs, tambien puedo sugerirte un bundle con camiseta termica para subir AOV.",
      en: " If bundles are enabled, I can also suggest a thermal layer bundle to increase AOV.",
    };

    const policySnippet = answerPolicies === "true"
      ? adminLanguage === "es"
        ? " Incluye cambios hasta 30 dias."
        : " Includes easy exchanges within 30 days."
      : "";

    const orderSnippet = answerOrders === "true"
      ? adminLanguage === "es"
        ? " Tambien puedo ayudarte con tracking de pedidos."
        : " I can also assist with order tracking."
      : "";

    const recommendationSnippet = recommendProducts === "true"
      ? adminLanguage === "es"
        ? " Te dejo dos alternativas mas para comparar rapido."
        : " I can suggest two more alternatives for a quick comparison."
      : "";

    let baseMessage = "";
    if (responseStyle === "CONCISE") {
      baseMessage = adminLanguage === "es" ? conciseTone.es : conciseTone.en;
    } else if (responseStyle === "DETAILED") {
      baseMessage = adminLanguage === "es" ? detailedTone.es : detailedTone.en;
    } else {
      baseMessage = adminLanguage === "es" ? balancedTone.es : balancedTone.en;
    }

    if (botTone === "sales" || botGoal === "SALES") {
      baseMessage += adminLanguage === "es" ? salesBoost.es : salesBoost.en;
    }

    return `${baseMessage}${policySnippet}${orderSnippet}${recommendationSnippet}`;
  }, [
    adminLanguage,
    answerOrders,
    answerPolicies,
    answerProducts,
    botGoal,
    botTone,
    recommendProducts,
    responseStyle,
  ]);

  const previewGoalTag = botGoal === "SALES"
    ? adminLanguage === "es" ? "Modo ventas" : "Sales mode"
    : botGoal === "SUPPORT"
      ? adminLanguage === "es" ? "Modo soporte" : "Support mode"
      : adminLanguage === "es" ? "Ventas + soporte" : "Sales + support";

  const previewQuickReplies = [
    answerProducts === "true" ? (adminLanguage === "es" ? "Ver alternativas" : "Show alternatives") : null,
    recommendProducts === "true" ? (adminLanguage === "es" ? "Comparar tallas" : "Compare sizing") : null,
    answerPolicies === "true" ? (adminLanguage === "es" ? "Politica de cambios" : "Exchange policy") : null,
    answerOrders === "true" ? (adminLanguage === "es" ? "Seguir pedido" : "Track order") : null,
  ].filter((value): value is string => Boolean(value));

  const normalizedPrimaryColor = /^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : "#008060";

  const previewLauncherLabel = launcherLabel.trim() || (adminLanguage === "es" ? "Asistente" : "Assistant");

  const previewLauncherAvatar = avatarStyle === "spark" ? "*" : avatarStyle === "store" ? "ST" : "AI";

  const stepFrameClass = stepDirection === "forward"
    ? "onb-step-frame onb-step-frame-forward"
    : stepDirection === "backward"
      ? "onb-step-frame onb-step-frame-backward"
      : "onb-step-frame onb-step-frame-neutral";

  const renderMockChatPreview = () => {
    const previewTitle = botName.trim() || (adminLanguage === "es" ? "Asistente AI" : "AI Assistant");
    const previewSubtitle = adminLanguage === "es"
      ? `En linea · ${previewGoalTag}`
      : `Online · ${previewGoalTag}`;

    const previewLauncherAriaLabel = isPreviewChatOpen
      ? adminLanguage === "es" ? "Cerrar chat" : "Close chat"
      : `${adminLanguage === "es" ? "Abrir chat" : "Open chat"} · ${previewLauncherLabel}`;

    return (
      <div className="onb-preview-card">
        <p className="onb-preview-kicker">{adminLanguage === "es" ? "Vista previa" : "Live preview"}</p>

        <div className="onb-preview-stage">
          {isPreviewChatOpen ? (
            <div
              className={`onb-preview-modal ${
                launcherPosition === "bottom-left" ? "onb-preview-modal-left" : "onb-preview-modal-right"
              }`}
            >
              <div className="onb-mock-chat">
                <div
                  className="onb-mock-chat-head"
                  style={{ backgroundColor: normalizedPrimaryColor, borderBottomColor: normalizedPrimaryColor }}
                >
                  <div>
                    <p className="onb-mock-chat-title" style={{ color: "#ffffff" }}>{previewTitle}</p>
                    <p className="onb-mock-chat-subtitle" style={{ color: "rgba(255,255,255,0.9)" }}>{previewSubtitle}</p>
                  </div>
                  <button
                    type="button"
                    className="onb-mock-chat-close"
                    aria-label={adminLanguage === "es" ? "Cerrar chat" : "Close chat"}
                    onClick={() => setIsPreviewChatOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="onb-mock-chat-body">
                  <p className="onb-chat-day-divider">{adminLanguage === "es" ? "Hoy" : "Today"}</p>
                  {step === 2 ? (
                    <div className="onb-chat-row onb-chat-row-bot">
                      <p className="onb-chat-bubble onb-chat-bubble-bot">{welcomeMessage}</p>
                    </div>
                  ) : (
                    <>
                      <div className="onb-chat-row onb-chat-row-user">
                        <p
                          className="onb-chat-bubble onb-chat-bubble-user"
                          style={{ backgroundColor: normalizedPrimaryColor, borderColor: normalizedPrimaryColor, color: "#ffffff" }}
                        >
                          {previewUserMessage}
                        </p>
                      </div>

                      <div className="onb-chat-row onb-chat-row-bot">
                        <p className="onb-chat-bubble onb-chat-bubble-bot">{previewAssistantMessage}</p>
                      </div>

                      {answerProducts === "true" ? (
                        <div className="onb-mock-product">
                          <p className="onb-mock-product-title">{adminLanguage === "es" ? "Flux Shell Lite" : "Flux Shell Lite"}</p>
                          <p className="onb-mock-product-meta">
                            {adminLanguage === "es" ? "Ligera · Transpirable · EUR 79" : "Lightweight · Breathable · EUR 79"}
                          </p>
                          <p className="onb-mock-product-cta" style={{ color: normalizedPrimaryColor }}>
                            {recommendProducts === "true"
                              ? adminLanguage === "es" ? "CTA: Ver comparativa" : "CTA: View comparison"
                              : adminLanguage === "es" ? "CTA: Ver producto" : "CTA: View product"}
                          </p>
                        </div>
                      ) : null}

                      {previewQuickReplies.length > 0 ? (
                        <div className="onb-quick-replies">
                          {previewQuickReplies.map((reply) => (
                            <span key={reply} className="onb-quick-reply">{reply}</span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="onb-chat-composer">
                  <span>{adminLanguage === "es" ? "Escribe tu mensaje" : "Type your message"}</span>
                  <span className="onb-chat-send" style={{ backgroundColor: normalizedPrimaryColor }}>➤</span>
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={`onb-runtime-launcher ${
              launcherPosition === "bottom-left" ? "onb-runtime-launcher-left" : "onb-runtime-launcher-right"
            }`}
          >
            <button
              type="button"
              className="onb-runtime-launcher-button"
              style={{ backgroundColor: normalizedPrimaryColor }}
              onClick={() => setIsPreviewChatOpen((current) => !current)}
              aria-expanded={isPreviewChatOpen}
              aria-label={previewLauncherAriaLabel}
            >
              <span className="onb-runtime-launcher-icon">{isPreviewChatOpen ? "×" : previewLauncherAvatar}</span>
            </button>
          </div>
        </div>

        <p className="onb-preview-caption">
          {isPreviewChatOpen
            ? (adminLanguage === "es" ? "Pulsa X para cerrar el chat." : "Press X to close the chat.")
            : (adminLanguage === "es" ? "Pulsa el globo para abrir la conversacion." : "Press the bubble to open the conversation.")}
        </p>
      </div>
    );
  };

  const renderStepBody = () => {
    if (step === 1) {
      return (
        <BlockStack gap="300">
          <h2 className="onb-step-headline">{copy.languageTitle}</h2>
          <p className="onb-step-copy">
            {adminLanguage === "es"
              ? "Selecciona el idioma maestro de tu asistente. Se aplicara al panel, al bot y a la experiencia del merchant."
              : "Select one global language. It will be applied to both admin and chatbot."}
          </p>

          <FormLayout>
            <Select
              label={adminLanguage === "es" ? "Idioma global" : "Global language"}
              options={[
                { label: "Espanol", value: "es" },
                { label: "English", value: "en" },
              ]}
              value={adminLanguage}
              onChange={(value) => setAdminLanguage(value as AdminLanguage)}
            />
          </FormLayout>

          <div className="onb-note-grid">
            <div className="onb-note-card">
              <p className="onb-note-title">{adminLanguage === "es" ? "Consistencia total" : "Full consistency"}</p>
              <p className="onb-note-text">
                {adminLanguage === "es"
                  ? "Evita desalineaciones: el panel de admin y el chatbot quedan sincronizados."
                  : "Avoid drift: admin surface and chatbot remain synchronized."}
              </p>
            </div>
            <div className="onb-note-card">
              <p className="onb-note-title">{adminLanguage === "es" ? "Editable despues" : "Editable later"}</p>
              <p className="onb-note-text">
                {adminLanguage === "es"
                  ? "Puedes cambiarlo mas tarde desde Settings sin repetir onboarding."
                  : "You can change it later from Settings without re-running onboarding."}
              </p>
            </div>
          </div>
        </BlockStack>
      );
    }

    if (step === 2) {
      return (
        <BlockStack gap="300">
          <h2 className="onb-step-headline">{copy.welcomeTitle}</h2>
          <p className="onb-step-copy">{copy.welcomeText}</p>
          <TextField
            label={adminLanguage === "es" ? "Mensaje de bienvenida" : "Welcome message"}
            value={welcomeMessage}
            onChange={setWelcomeMessage}
            autoComplete="off"
            multiline={3}
          />
          <List>
            {copy.welcomeBullets.map((bullet) => (
              <List.Item key={bullet}>{bullet}</List.Item>
            ))}
          </List>

          <div className="onb-note-card">
            <p className="onb-note-title">{adminLanguage === "es" ? "Ritmo de trabajo" : "Workflow rhythm"}</p>
            <p className="onb-note-text">
              {adminLanguage === "es"
                ? "Te guiaremos paso a paso: primero identidad, luego capacidades y finalmente activacion."
                : "You will go step by step: identity first, then capabilities, then activation."}
            </p>
          </div>
        </BlockStack>
      );
    }

    if (step === 3) {
      return (
        <BlockStack gap="300">
          <h2 className="onb-step-headline">{copy.profileTitle}</h2>
          <p className="onb-step-copy">
            {adminLanguage === "es"
              ? "Define personalidad y objetivo. Este tono se reflejara en cada respuesta del asistente."
              : "Define personality and goal. This tone will drive every assistant response."}
          </p>
          <FormLayout>
            <TextField
              label={adminLanguage === "es" ? "Nombre del chatbot" : "Chatbot name"}
              value={botName}
              onChange={setBotName}
              autoComplete="off"
            />

            <Select
              label={adminLanguage === "es" ? "Tono" : "Tone"}
              options={[
                { label: adminLanguage === "es" ? "Profesional" : "Professional", value: "professional" },
                { label: adminLanguage === "es" ? "Cercano" : "Friendly", value: "friendly" },
                { label: adminLanguage === "es" ? "Conciso" : "Concise", value: "concise" },
                { label: adminLanguage === "es" ? "Comercial" : "Sales-focused", value: "sales" },
              ]}
              value={botTone}
              onChange={(value) => setBotTone(value as BotTone)}
            />

            <Select
              label={adminLanguage === "es" ? "Objetivo principal" : "Primary goal"}
              options={[
                { label: adminLanguage === "es" ? "Ventas" : "Sales", value: "SALES" },
                { label: adminLanguage === "es" ? "Soporte" : "Support", value: "SUPPORT" },
                { label: adminLanguage === "es" ? "Ventas + Soporte" : "Sales + Support", value: "SALES_SUPPORT" },
              ]}
              value={botGoal}
              onChange={(value) => setBotGoal(value as BotGoal)}
            />
          </FormLayout>

          <div className="onb-note-card">
            <p className="onb-note-title">{adminLanguage === "es" ? "Vista previa de tono" : "Tone preview"}</p>
            <p className="onb-note-text">{tonePreview[botTone]}</p>
          </div>
        </BlockStack>
      );
    }

    if (step === 4) {
      return (
        <BlockStack gap="300">
          <h2 className="onb-step-headline">{copy.capabilitiesTitle}</h2>
          <p className="onb-step-copy">
            {adminLanguage === "es"
              ? "Activa lo que realmente necesitas en el arranque. Podras refinarlo luego por canal o mercado."
              : "Enable only what you need at launch. You can refine by channel or market later."}
          </p>
          <FormLayout>
            <Select
              label={adminLanguage === "es" ? "Responder sobre productos" : "Answer product questions"}
              options={[
                { label: adminLanguage === "es" ? "Activado" : "Enabled", value: "true" },
                { label: adminLanguage === "es" ? "Desactivado" : "Disabled", value: "false" },
              ]}
              value={answerProducts}
              onChange={setAnswerProducts}
            />

            <Select
              label={adminLanguage === "es" ? "Responder sobre politicas" : "Answer policy questions"}
              options={[
                { label: adminLanguage === "es" ? "Activado" : "Enabled", value: "true" },
                { label: adminLanguage === "es" ? "Desactivado" : "Disabled", value: "false" },
              ]}
              value={answerPolicies}
              onChange={setAnswerPolicies}
            />

            <Select
              label={adminLanguage === "es" ? "Responder sobre pedidos" : "Answer order questions"}
              options={[
                { label: adminLanguage === "es" ? "Activado" : "Enabled", value: "true" },
                { label: adminLanguage === "es" ? "Desactivado" : "Disabled", value: "false" },
              ]}
              value={answerOrders}
              onChange={setAnswerOrders}
            />

            <Select
              label={adminLanguage === "es" ? "Recomendaciones de producto" : "Product recommendations"}
              options={[
                { label: adminLanguage === "es" ? "Activado" : "Enabled", value: "true" },
                { label: adminLanguage === "es" ? "Desactivado" : "Disabled", value: "false" },
              ]}
              value={recommendProducts}
              onChange={setRecommendProducts}
            />

            <Select
              label={adminLanguage === "es" ? "Captura de leads" : "Lead capture"}
              options={[
                { label: adminLanguage === "es" ? "Activado" : "Enabled", value: "true" },
                { label: adminLanguage === "es" ? "Desactivado" : "Disabled", value: "false" },
              ]}
              value={captureLeads}
              onChange={setCaptureLeads}
            />

            <Select
              label={adminLanguage === "es" ? "Estilo de respuestas" : "Response style"}
              options={[
                { label: adminLanguage === "es" ? "Conciso" : "Concise", value: "CONCISE" },
                { label: adminLanguage === "es" ? "Equilibrado" : "Balanced", value: "BALANCED" },
                { label: adminLanguage === "es" ? "Detallado" : "Detailed", value: "DETAILED" },
              ]}
              value={responseStyle}
              onChange={(value) => setResponseStyle(value as ResponseStyle)}
            />
          </FormLayout>

          <div className="onb-chip-row">
            {capabilitySummary.map((item) => (
              <span
                key={item.label}
                className={`onb-chip ${item.enabled ? "onb-chip-on" : "onb-chip-off"}`}
              >
                {item.label}: {item.enabled ? (adminLanguage === "es" ? "ON" : "ON") : "OFF"}
              </span>
            ))}
          </div>
        </BlockStack>
      );
    }

    if (step === 5) {
      return (
        <BlockStack gap="300">
          <h2 className="onb-step-headline">{copy.brandingTitle}</h2>
          <p className="onb-step-copy">
            {adminLanguage === "es"
              ? "Haz que el widget se sienta parte de tu marca con un look base limpio y reconocible."
              : "Make the widget feel native to your brand with a clean visual baseline."}
          </p>
          <FormLayout>
            <BlockStack gap="100">
              <Text as="span" variant="bodyMd" fontWeight="medium">
                {adminLanguage === "es" ? "Color principal" : "Primary color"}
              </Text>
              <InlineStack gap="200" blockAlign="center">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : "#008060"}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{
                    width: 44,
                    height: 36,
                    padding: "2px",
                    border: "1px solid #8c9196",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                />
                <TextField
                  label=""
                  labelHidden
                  value={primaryColor}
                  onChange={setPrimaryColor}
                  autoComplete="off"
                  placeholder="#008060"
                />
              </InlineStack>
            </BlockStack>

            <Select
              label={adminLanguage === "es" ? "Posicion del launcher" : "Launcher position"}
              options={[
                {
                  label: adminLanguage === "es" ? "Inferior derecha" : "Bottom right",
                  value: "bottom-right",
                },
                {
                  label: adminLanguage === "es" ? "Inferior izquierda" : "Bottom left",
                  value: "bottom-left",
                },
              ]}
              value={launcherPosition}
              onChange={(value) => setLauncherPosition(value as "bottom-right" | "bottom-left")}
            />

            <Select
              label={adminLanguage === "es" ? "Estilo de avatar" : "Avatar style"}
              options={[
                { label: adminLanguage === "es" ? "Asistente" : "Assistant", value: "assistant" },
                { label: adminLanguage === "es" ? "Spark" : "Spark", value: "spark" },
                { label: adminLanguage === "es" ? "Store" : "Store", value: "store" },
              ]}
              value={avatarStyle}
              onChange={(value) => setAvatarStyle(value as "assistant" | "spark" | "store")}
            />

            <TextField
              label={adminLanguage === "es" ? "Texto del launcher" : "Launcher label"}
              value={launcherLabel}
              onChange={setLauncherLabel}
              autoComplete="off"
            />
          </FormLayout>

          <div
            className={`onb-widget-preview onb-widget-preview-launcher ${
              launcherPosition === "bottom-left" ? "onb-launcher-left" : "onb-launcher-right"
            }`}
          >
            <div className="onb-widget-dot" style={{ backgroundColor: primaryColor || "#0f766e" }} />
            <p className="onb-widget-copy">
              {adminLanguage === "es"
                ? `Preview: \"${launcherLabel || "Asistente"}\" listo en ${launcherPosition === "bottom-left" ? "inferior izquierda" : "inferior derecha"}.`
                : `Preview: \"${launcherLabel || "Assistant"}\" ready on ${launcherPosition === "bottom-left" ? "bottom left" : "bottom right"}.`}
            </p>
          </div>
        </BlockStack>
      );
    }

    if (step === 6) {
      return (
        <BlockStack gap="300">
          <h2 className="onb-step-headline">{copy.reviewTitle}</h2>
          <p className="onb-step-copy">{copy.reviewText}</p>

          <List>
            <List.Item>{`${adminLanguage === "es" ? "Idioma global" : "Global language"}: ${adminLanguage}`}</List.Item>
            <List.Item>{`${adminLanguage === "es" ? "Nombre" : "Name"}: ${botName}`}</List.Item>
            <List.Item>{`${adminLanguage === "es" ? "Objetivo" : "Goal"}: ${botGoal}`}</List.Item>
            <List.Item>{`${adminLanguage === "es" ? "Estilo" : "Style"}: ${responseStyle}`}</List.Item>
            <List.Item>{`${adminLanguage === "es" ? "Recomendaciones" : "Recommendations"}: ${recommendProducts === "true" ? "ON" : "OFF"}`}</List.Item>
            <List.Item>{`${adminLanguage === "es" ? "Color widget" : "Widget color"}: ${primaryColor}`}</List.Item>
            <List.Item>{`${adminLanguage === "es" ? "Posicion" : "Position"}: ${launcherPosition}`}</List.Item>
          </List>

          <div className="onb-note-card">
            <p className="onb-note-title">{adminLanguage === "es" ? "Checklist final" : "Final checklist"}</p>
            <p className="onb-note-text">
              {adminLanguage === "es"
                ? "Si algo no te convence, vuelve un paso atras y ajustalo antes de activar."
                : "If anything feels off, go one step back and fine-tune it before activation."}
            </p>
          </div>
        </BlockStack>
      );
    }

    return (
      <BlockStack gap="300">
        <h2 className="onb-step-headline">{copy.activateTitle}</h2>
        <p className="onb-step-copy">{copy.activateText}</p>
        <div className="onb-widget-preview">
          <div className="onb-widget-dot" style={{ backgroundColor: "#2f9b82" }} />
          <p className="onb-widget-copy">{copy.activatedMessage}</p>
        </div>
      </BlockStack>
    );
  };

  return (
    <Page title={copy.title} subtitle={copy.subtitle}>
      <style>{ONBOARDING_STYLES}</style>
      <div className="onb-shell">
        <div className="onb-orb onb-orb-1" />
        <div className="onb-orb onb-orb-2" />

        <Layout>
          {actionData?.ok && actionData.message ? (
            <Layout.Section>
              <Banner tone="success" title={actionData.message} />
            </Layout.Section>
          ) : null}

          {!actionData?.ok && actionData?.error ? (
            <Layout.Section>
              <Banner tone="critical" title={actionData.error} />
            </Layout.Section>
          ) : null}

          <Layout.Section>
            <div className="onb-hero">
              <div className="onb-hero-card">
                <BlockStack gap="200">
                  <p className="onb-kicker">
                    {adminLanguage === "es" ? "Instalacion guiada" : "Guided setup"}
                  </p>
                  <h1 className="onb-title">{copy.title}</h1>
                  <p className="onb-subtitle">{copy.subtitle}</p>
                </BlockStack>
              </div>

              <div className="onb-progress-card">
                <p className="onb-progress-title">{copy.progressLabel}</p>
                <p className="onb-progress-value">{`${progress}%`}</p>
                <ProgressBar progress={progress} size="small" />
                <p className="onb-progress-hint">{`${copy.stepLabel} ${step}/${totalSteps}`}</p>
              </div>
            </div>
          </Layout.Section>

          <Layout.Section>
            <div className="onb-content-stage">
              <div className="onb-content-column">
                {showSectionSummaryCards ? (
                  <Card>
                    <div className="onb-section-track">
                      {sectionProgress.map((section) => (
                        <div
                          key={section.key}
                          className={`onb-section-card ${section.status === "active" ? "onb-section-card-active" : section.status === "done" ? "onb-section-card-done" : ""}`}
                        >
                          <p className="onb-section-kicker">{section.title}</p>
                          <p className="onb-section-title">{section.label}</p>
                          <ProgressBar progress={section.percent} size="small" />
                          <div className="onb-section-meta">
                            <p className="onb-section-percent">{`${section.percent}%`}</p>
                            <p className="onb-section-status">{`${section.completedSteps}/${section.totalSectionSteps} · ${section.statusLabel}`}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}

                <Card>
                  <div className="onb-step-track">
                    {stepTitles.map((title, index) => {
                      const currentIndex = index + 1;
                      const stateClass = currentIndex === step
                        ? "onb-step-pill-current"
                        : currentIndex < step
                          ? "onb-step-pill-done"
                          : "";

                      return (
                        <div
                          key={`${title}-${currentIndex}`}
                          className={`onb-step-pill ${stateClass}`}
                          style={{ animationDelay: `${index * 55}ms` }}
                          onClick={() => handleStepClick(currentIndex)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleStepClick(currentIndex);
                            }
                          }}
                        >
                          <span className="onb-step-index">{currentIndex}</span>
                          <span className="onb-step-label">{title}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card>
                  <div className="onb-form-card">
                    <Form method="post" ref={formRef}>
                      <BlockStack gap="400">
                        <input type="hidden" name="step" value={String(step)} />
                        <input ref={intentInputRef} type="hidden" name="intent" defaultValue="save_only" />

                        <HiddenOnboardingInputs
                          adminLanguage={adminLanguage}
                          botName={botName}
                          botTone={botTone}
                          botGoal={botGoal}
                          responseStyle={responseStyle}
                          welcomeMessage={welcomeMessage}
                          answerProducts={answerProducts === "true"}
                          answerPolicies={answerPolicies === "true"}
                          answerOrders={answerOrders === "true"}
                          recommendProducts={recommendProducts === "true"}
                          captureLeads={captureLeads === "true"}
                          primaryColor={primaryColor}
                          launcherPosition={launcherPosition}
                          avatarStyle={avatarStyle}
                          launcherLabel={launcherLabel}
                        />

                        <div key={`step-${step}`} className={stepFrameClass}>
                          <BlockStack gap="300">
                            {renderStepBody()}
                          </BlockStack>
                        </div>

                        <div className="onb-nav-row">
                          <InlineStack align="space-between" blockAlign="center">
                            {step > 1 ? (
                              <Button submit onClick={() => setIntent("back")} loading={isSubmitting}>
                                {copy.back}
                              </Button>
                            ) : (
                              <span />
                            )}

                            {step < TOTAL_STEPS ? (
                              <Button
                                submit
                                variant="primary"
                                onClick={() => setIntent("save_continue")}
                                loading={isSubmitting}
                              >
                                {copy.next}
                              </Button>
                            ) : (
                              <Button
                                submit
                                variant="primary"
                                onClick={() => setIntent("complete")}
                                loading={isSubmitting}
                              >
                                {copy.complete}
                              </Button>
                            )}
                          </InlineStack>

                          {step < TOTAL_STEPS ? (
                            <p style={{ margin: "10px 0 0", color: "#7a6f65", fontSize: "0.85rem" }}>
                              {adminLanguage === "es"
                                ? "Los cambios se guardan automáticamente mientras avanzas."
                                : "Changes are automatically saved while you continue."}
                            </p>
                          ) : null}
                        </div>
                      </BlockStack>
                    </Form>
                  </div>
                </Card>
              </div>

              <div className="onb-preview-slot">
                {renderMockChatPreview()}
              </div>
            </div>
          </Layout.Section>
        </Layout>
      </div>
    </Page>
  );
}
