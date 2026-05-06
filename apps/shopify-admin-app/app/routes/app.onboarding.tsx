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
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  type AdminLanguage,
  type BotGoal,
  type BotTone,
  type ResponseStyle,
  getMerchantAdminConfig,
  saveMerchantAdminConfig,
} from "../services/admin-config.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";

type OnboardingIntent = "back" | "save_only" | "save_continue" | "complete";

interface OnboardingActionData {
  ok: boolean;
  message?: string;
  error?: string;
  nextStep?: number;
  redirectTo?: string;
}

const TOTAL_STEPS = 4;

const ONBOARDING_COPY = {
  es: {
    title: "The 4-Step Magic Setup",
    subtitle: "Configura Fluxbot en 4 capitulos con preview en vivo y activacion guiada.",
    stepLabel: "Paso",
    progressLabel: "Magic setup",
    saveDraft: "Guardar progreso",
    back: "Volver",
    next: "Continuar",
    complete: "Activar Fluxbot en mi tienda",
    welcomeTitle: "Identidad",
    welcomeText:
      "Define el idioma, el nombre y el primer saludo para que tu asistente se sienta real desde el minuto uno.",
    welcomeBullets: [
      "Idioma global y consistente con la tienda",
      "Nombre visible en la cabecera del chat",
      "Mensaje de bienvenida listo para usar",
      "Preview instantaneo mientras escribes",
    ],
    languageTitle: "Identidad",
    profileTitle: "Cerebro",
    capabilitiesTitle: "Superpoderes",
    brandingTitle: "Estilo",
    reviewTitle: "Despegue",
    activateTitle: "Despegue",
    reviewText: "Resumen visual y sincronizacion inicial antes de activar.",
    activateText:
      "Sincronizaremos catalogo, politicas y capacidades base para que la primera conversacion ya se sienta util.",
    activatedMessage: "Fluxbot listo para atender en tu tienda.",
  },
  en: {
    title: "The 4-Step Magic Setup",
    subtitle: "Configure Fluxbot in 4 chapters with live preview and guided activation.",
    stepLabel: "Step",
    progressLabel: "Magic setup",
    saveDraft: "Save progress",
    back: "Back",
    next: "Continue",
    complete: "Activate Fluxbot in my store",
    welcomeTitle: "Identity",
    welcomeText:
      "Define language, assistant name, and first greeting so the bot feels real from the first minute.",
    welcomeBullets: [
      "Single global language aligned with the store",
      "Assistant name visible in chat header",
      "Ready-to-use welcome message",
      "Instant live preview while you type",
    ],
    languageTitle: "Identity",
    profileTitle: "Brain",
    capabilitiesTitle: "Superpowers",
    brandingTitle: "Style",
    reviewTitle: "Launch",
    activateTitle: "Launch",
    reviewText: "Visual summary and initial sync before activation.",
    activateText:
      "We will sync catalog, policies, and core capabilities so the very first chat already feels useful.",
    activatedMessage: "Fluxbot is ready for your storefront.",
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
  gap: 24px;
  align-items: stretch;
}

.onb-hero-card,
.onb-progress-card {
  border: 1px solid var(--onb-border);
  border-radius: 18px;
  background: rgba(255, 251, 246, 0.88);
  box-shadow: 0 12px 26px rgba(70, 48, 24, 0.08);
  padding: 20px;
  animation: onbFadeUp 520ms ease both;
}

.onb-progress-card {
  display: grid;
  gap: 12px;
}

.onb-progress-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
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

.onb-progress-step-name {
  margin: 0;
  color: #2d3745;
  font-size: 1rem;
  line-height: 1.35;
  font-weight: 700;
}

.onb-progress-hint {
  margin: 0;
  color: #74675c;
  font-size: 0.86rem;
}

.onb-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.onb-progress-next {
  margin: 0;
  color: #665b50;
  font-size: 0.84rem;
  line-height: 1.45;
}

.onb-progress-caption {
  margin: 0;
  color: #74675c;
  font-size: 0.84rem;
  line-height: 1.5;
}

.onb-content-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.56fr);
  gap: 24px;
  align-items: start;
}

.onb-content-stage-full {
  grid-template-columns: 1fr;
}

.onb-content-column {
  display: grid;
  gap: 16px;
}

.onb-section-track {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  gap: 8px;
  flex-wrap: wrap;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.onb-step-pill {
  border: 1px solid var(--onb-border);
  border-radius: 12px;
  background: #ffffff;
  padding: 10px 8px;
  min-height: 78px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  animation: onbFadeUp 480ms ease both;
  cursor: pointer;
  transition: all 180ms ease;
  min-width: 0;
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
  overflow-wrap: anywhere;
}

.onb-form-card {
  border: 1px solid var(--onb-border);
  border-radius: 18px;
  background: rgba(255, 251, 246, 0.94);
  padding: 18px;
}

.onb-preview-slot {
  width: 100%;
  position: sticky;
  top: 24px;
}

.onb-preview-card {
  border: 1px solid #d7cdbf;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8f2ea 0%, #f2e9de 100%);
  padding: 12px;
  box-shadow: 0 10px 18px rgba(70, 48, 24, 0.08);
  display: flex;
  flex-direction: column;
  height: 680px;
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

.onb-preview-stage .onb-preview-launcher.fluxbot-launcher,
.onb-widget-preview .fluxbot-launcher {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  display: flex;
  align-items: center;
  gap: 12px;
}

.onb-widget-preview .fluxbot-launcher {
  position: static;
  z-index: auto;
}

.onb-preview-stage .fluxbot-launcher--bottom-right,
.onb-widget-preview .fluxbot-launcher--bottom-right {
  flex-direction: row-reverse;
}

.onb-preview-stage .fluxbot-launcher__label,
.onb-widget-preview .fluxbot-launcher__label {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  max-width: min(220px, calc(100vw - 120px));
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.92);
  color: #ffffff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.2s ease, transform 0.2s ease, max-width 0.2s ease, padding 0.2s ease;
}

.onb-preview-stage .fluxbot-launcher--open .fluxbot-launcher__label,
.onb-widget-preview .fluxbot-launcher--open .fluxbot-launcher__label {
  opacity: 0;
  transform: translateY(6px);
  max-width: 0;
  padding-left: 0;
  padding-right: 0;
  pointer-events: none;
}

.onb-preview-stage .fluxbot-launcher__button,
.onb-widget-preview .fluxbot-launcher__button {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background-color: var(--fluxbot-primary-color);
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  padding: 0;
}

.onb-preview-stage .fluxbot-launcher__button:hover,
.onb-widget-preview .fluxbot-launcher__button:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
}

.onb-preview-stage .fluxbot-launcher__button:active,
.onb-widget-preview .fluxbot-launcher__button:active {
  transform: scale(0.95);
}

.onb-preview-stage .fluxbot-launcher__button:focus-visible,
.onb-widget-preview .fluxbot-launcher__button:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

.onb-preview-stage .fluxbot-launcher__icon,
.onb-widget-preview .fluxbot-launcher__icon {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.onb-preview-stage .fluxbot-launcher__icon--close,
.onb-widget-preview .fluxbot-launcher__icon--close {
  position: absolute;
  opacity: 0;
  transform: rotate(-90deg);
}

.onb-preview-stage .fluxbot-launcher--open .fluxbot-launcher__icon--chat,
.onb-widget-preview .fluxbot-launcher--open .fluxbot-launcher__icon--chat {
  opacity: 0;
  transform: rotate(90deg);
}

.onb-preview-stage .fluxbot-launcher--open .fluxbot-launcher__icon--close,
.onb-widget-preview .fluxbot-launcher--open .fluxbot-launcher__icon--close {
  opacity: 1;
  transform: rotate(0deg);
}

.onb-preview-stage .onb-preview-launcher {
  position: absolute;
  bottom: 14px;
  z-index: 2;
}

.onb-preview-launcher.fluxbot-launcher--bottom-left {
  left: 14px;
}

.onb-preview-launcher.fluxbot-launcher--bottom-right {
  right: 14px;
}

.onb-preview-stage .fluxbot-chat-window {
  position: absolute;
  bottom: 84px;
  width: min(420px, calc(100% - 28px));
  height: 600px;
  max-height: calc(100% - 96px);
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 2;
  animation: slideUp 0.3s ease;
}

.onb-preview-stage .fluxbot-chat-window[hidden] {
  display: none !important;
}

.onb-preview-stage .onb-preview-chat-window-left {
  left: 14px;
}

.onb-preview-stage .onb-preview-chat-window-right {
  right: 14px;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.onb-preview-stage .fluxbot-chat-window__header {
  background: var(--fluxbot-primary-color);
  color: #ffffff;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.onb-preview-stage .fluxbot-chat-window__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.onb-preview-stage .fluxbot-chat-window__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  opacity: 0.9;
  line-height: 1.2;
}

.onb-preview-stage .fluxbot-chat-window__close {
  background: transparent;
  border: none;
  color: #ffffff;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}

.onb-preview-stage .fluxbot-chat-window__close:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.onb-preview-stage .fluxbot-chat-window__messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #f7f8fa;
}

.onb-preview-stage .fluxbot-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 85%;
}

.onb-preview-stage .fluxbot-message--user {
  align-self: flex-end;
}

.onb-preview-stage .fluxbot-message--assistant {
  align-self: flex-start;
}

.onb-preview-stage .fluxbot-message__content {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.5;
  font-size: 14px;
}

.onb-preview-stage .fluxbot-message--user .fluxbot-message__content {
  background: var(--fluxbot-primary-color);
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.onb-preview-stage .fluxbot-message--assistant .fluxbot-message__content {
  background: #ffffff;
  color: #1a1a1a;
  border-bottom-left-radius: 4px;
}

.onb-preview-stage .fluxbot-product-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.onb-preview-stage .fluxbot-product-card {
  padding: 12px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.onb-preview-stage .fluxbot-product-card__link {
  display: flex;
  gap: 12px;
  width: 100%;
  text-decoration: none;
  color: inherit;
}

.onb-preview-stage .fluxbot-product-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.onb-preview-stage .fluxbot-product-card__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.onb-preview-stage .fluxbot-product-card__title {
  font-size: 13px;
  font-weight: 500;
  color: #1a1a1a;
  line-height: 1.4;
}

.onb-preview-stage .fluxbot-product-card__price {
  font-size: 14px;
  font-weight: 600;
  color: var(--fluxbot-primary-color);
}

.onb-preview-stage .fluxbot-product-card__actions {
  margin-top: 8px;
}

.onb-preview-stage .fluxbot-product-card__add {
  border: 1px solid var(--fluxbot-primary-color);
  color: var(--fluxbot-primary-color);
  background: transparent;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.onb-preview-stage .fluxbot-product-card__add:hover {
  background: rgba(0, 0, 0, 0.04);
}

.onb-preview-stage .fluxbot-chat-window__input {
  padding: 16px 20px;
  border-top: 1px solid #e0e0e0;
  background: #ffffff;
}

.onb-preview-stage .fluxbot-chat-form {
  display: flex;
  gap: 8px;
}

.onb-preview-stage .fluxbot-chat-form__input {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid #d0d0d0;
  border-radius: 20px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s ease;
  background: #ffffff;
}

.onb-preview-stage .fluxbot-chat-form__input:focus {
  border-color: var(--fluxbot-primary-color);
}

.onb-preview-stage .fluxbot-chat-form__submit {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--fluxbot-primary-color);
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.onb-preview-stage .fluxbot-chat-form__submit:hover {
  transform: scale(1.05);
}

.onb-preview-stage .fluxbot-chat-form__submit:active {
  transform: scale(0.95);
}

.onb-preview-stage .fluxbot-chat-window__footer {
  padding: 8px 12px;
  text-align: center;
  border-top: 1px solid #e0e0e0;
  background: #f7f8fa;
}

.onb-preview-stage .fluxbot-chat-window__branding {
  font-size: 11px;
  color: #999999;
  text-decoration: none;
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

.onb-note-card-highlight {
  background: linear-gradient(180deg, #fff8ef 0%, #f8efe2 100%);
  border-style: solid;
  border-color: #e5caa7;
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

.onb-choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.onb-choice-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.onb-choice-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.onb-choice-card {
  appearance: none;
  border: 1px solid #ddd2c5;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  padding: 14px;
  text-align: left;
  display: grid;
  gap: 6px;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.onb-choice-card:hover {
  transform: translateY(-1px);
  border-color: #b4c7d6;
  box-shadow: 0 8px 18px rgba(71, 101, 127, 0.08);
}

.onb-choice-card-active {
  border-color: var(--onb-accent);
  background: linear-gradient(180deg, #f3f7fa 0%, #ebf1f5 100%);
  box-shadow: inset 0 0 0 1px #d6e1e9;
}

.onb-choice-title {
  color: #2f3641;
  font-size: 0.9rem;
  font-weight: 700;
}

.onb-choice-description {
  color: #6a5f54;
  font-size: 0.78rem;
  line-height: 1.45;
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

.onb-widget-preview-launcher .fluxbot-launcher {
  flex-shrink: 0;
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

.onb-color-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.onb-color-swatch {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 0 0 1px #d6ccbf;
  cursor: pointer;
}

.onb-color-swatch-active {
  box-shadow: 0 0 0 2px #111827;
}

.onb-sync-card {
  border: 1px solid #ddd2c5;
  border-radius: 16px;
  background: linear-gradient(180deg, #fff8ef 0%, #f7ecde 100%);
  padding: 16px;
  display: grid;
  gap: 12px;
}

.onb-sync-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.onb-sync-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 6px 10px;
  background: #111827;
  color: #ffffff;
  font-size: 0.74rem;
  font-weight: 700;
}

.onb-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
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
  padding-top: 18px;
  margin-top: 8px;
}

.onb-nav-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.onb-nav-spacer {
  flex: 1 1 auto;
}

.onb-nav-button {
  appearance: none;
  border: 1px solid #c9ccd1;
  border-radius: 12px;
  background: #ffffff;
  color: #303030;
  min-height: 40px;
  padding: 0 16px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 180ms ease, border-color 180ms ease;
}

.onb-nav-button:hover:not(:disabled) {
  background: #f6f6f7;
  border-color: #b9bcc2;
}

.onb-nav-button:focus-visible {
  outline: 2px solid #0a66c2;
  outline-offset: 2px;
}

.onb-nav-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.onb-nav-button-primary {
  background: #111827;
  border-color: #111827;
  color: #ffffff;
}

.onb-nav-button-primary:hover:not(:disabled) {
  background: #1f2937;
  border-color: #1f2937;
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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

  .onb-choice-grid,
  .onb-choice-grid-2,
  .onb-choice-grid-3,
  .onb-summary-grid {
    grid-template-columns: 1fr;
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

  .onb-progress-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .onb-preview-slot {
    position: static;
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

function getDefaultBotName(language: AdminLanguage): string {
  return language === "es" ? "Asistente virtual" : "Virtual Assistant";
}

function getDefaultWelcomeMessage(language: AdminLanguage, botName: string): string {
  return language === "es"
    ? `Hola, soy ${botName}. Estoy aqui para ayudarte con productos, pedidos y dudas de tu tienda.`
    : `Hi, I'm ${botName}. I'm here to help with products, orders, and store questions.`;
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

function jsonResponse(body: OnboardingActionData, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
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

  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop not found" };
  }

  const currentConfig = await getMerchantAdminConfig(shop.id);
  const formData = await request.formData();
  const requestUrl = new URL(request.url);
  const wantsJsonResponse =
    String(formData.get("responseMode") || "").toLowerCase() === "json" ||
    request.headers.get("X-Requested-With") === "XMLHttpRequest";

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

  const normalizedBotName = botName || getDefaultBotName(adminLanguage);
  const normalizedWelcomeMessage = welcomeMessage || getDefaultWelcomeMessage(adminLanguage, normalizedBotName);
  const launcherLabel = String(formData.get("launcherLabel") || currentConfig.widgetBranding.launcherLabel).trim();
  const normalizedLauncherLabel = launcherLabel || normalizedBotName;

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
    botName: normalizedBotName,
    botTone,
    botGoal,
    responseStyle,
    welcomeMessage: normalizedWelcomeMessage,
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
      launcherLabel: normalizedLauncherLabel,
    },
    onboardingStep: onboardingCompleted ? TOTAL_STEPS : nextStep,
    onboardingCompleted,
  }, {
    currentConfig,
  });

  const redirectTo = intent === "complete"
    ? buildRedirectPath("/app", requestUrl, undefined, { onboarding: "done" })
    : buildRedirectPath("/app/onboarding", requestUrl, nextStep, { saved: "1" });

  if (wantsJsonResponse) {
    return jsonResponse({
      ok: true,
      nextStep,
      redirectTo,
    });
  }

  if (intent === "complete") {
    throw redirect(redirectTo);
  }

  throw redirect(redirectTo);
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

function PreviewLauncherChatIcon(props: {
  avatarStyle: "assistant" | "spark" | "store";
}) {
  if (props.avatarStyle === "spark") {
    return (
      <svg
        className="fluxbot-launcher__icon fluxbot-launcher__icon--chat"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12 3L13.9 8.1L19 10L13.9 11.9L12 17L10.1 11.9L5 10L10.1 8.1L12 3Z"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M19 4V7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <path d="M20.5 5.5H17.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }

  if (props.avatarStyle === "store") {
    return (
      <svg
        className="fluxbot-launcher__icon fluxbot-launcher__icon--chat"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M4 10H20V20H4V10Z"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 10L5 5H19L21 10"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 20V14H15V20"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      className="fluxbot-launcher__icon fluxbot-launcher__icon--chat"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.90003C9.87812 3.30496 11.1801 2.99659 12.5 3.00003H13C15.0843 3.11502 17.053 3.99479 18.5291 5.47089C20.0052 6.94699 20.885 8.91568 21 11V11.5Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PreviewCloseIcon(props: { className?: string; size?: number }) {
  return (
    <svg
      className={props.className}
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M18 6L6 18M6 6L18 18"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PreviewSendIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function OnboardingPage() {
  const { step, totalSteps, config, copy } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const showSectionSummaryCards = config.onboardingCompleted;
  const initialBotName = config.botName.trim() || getDefaultBotName(config.adminLanguage);
  const initialWelcomeMessage =
    config.welcomeMessage.trim() || getDefaultWelcomeMessage(config.adminLanguage, initialBotName);

  const [adminLanguage, setAdminLanguage] = useState<AdminLanguage>(config.adminLanguage);
  const [botName, setBotName] = useState(initialBotName);
  const [botTone, setBotTone] = useState<BotTone>(config.botTone);
  const [botGoal, setBotGoal] = useState<BotGoal>(config.botGoal);
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>(config.responseStyle);
  const [welcomeMessage, setWelcomeMessage] = useState(initialWelcomeMessage);

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
  const [launcherLabel, setLauncherLabel] = useState(config.widgetBranding.launcherLabel || initialBotName);
  const [isPreviewChatOpen, setIsPreviewChatOpen] = useState(true);
  const [syncPreviewProgress, setSyncPreviewProgress] = useState(18);
  const autoSaveRequestRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    setAdminLanguage(config.adminLanguage);
    const nextBotName = config.botName.trim() || getDefaultBotName(config.adminLanguage);
    setBotName(nextBotName);
    setBotTone(config.botTone);
    setBotGoal(config.botGoal);
    setResponseStyle(config.responseStyle);
    setWelcomeMessage(
      config.welcomeMessage.trim() || getDefaultWelcomeMessage(config.adminLanguage, nextBotName),
    );
    setAnswerProducts(config.enabledCapabilities.answerProducts ? "true" : "false");
    setAnswerPolicies(config.enabledCapabilities.answerPolicies ? "true" : "false");
    setAnswerOrders(config.enabledCapabilities.answerOrders ? "true" : "false");
    setRecommendProducts(config.enabledCapabilities.recommendProducts ? "true" : "false");
    setCaptureLeads(config.enabledCapabilities.captureLeads ? "true" : "false");
    setPrimaryColor(config.widgetBranding.primaryColor);
    setLauncherPosition(config.widgetBranding.launcherPosition);
    setAvatarStyle(config.widgetBranding.avatarStyle);
    setLauncherLabel(config.widgetBranding.launcherLabel || nextBotName);
  }, [config]);

  const isSubmitting = navigation.state === "submitting";
  const progress = useMemo(() => Math.round((step / totalSteps) * 100), [step, totalSteps]);
  const normalizedBotName = botName.trim() || getDefaultBotName(adminLanguage);
  const normalizedWelcomeMessage = welcomeMessage.trim() || getDefaultWelcomeMessage(adminLanguage, normalizedBotName);
  const normalizedLauncherLabel = launcherLabel.trim() || normalizedBotName;
  const normalizedPrimaryColor = /^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : "#008060";
  const previousStepRef = useRef(step);
  const formRef = useRef<HTMLFormElement>(null);
  const [stepDirection, setStepDirection] = useState<"forward" | "backward" | "neutral">("neutral");
  const persistedConfigSnapshot = useMemo(
    () => JSON.stringify({
      adminLanguage: config.adminLanguage,
      botName: config.botName.trim() || getDefaultBotName(config.adminLanguage),
      botTone: config.botTone,
      botGoal: config.botGoal,
      responseStyle: config.responseStyle,
      welcomeMessage:
        config.welcomeMessage.trim() ||
        getDefaultWelcomeMessage(config.adminLanguage, config.botName.trim() || getDefaultBotName(config.adminLanguage)),
      enabledCapabilities: config.enabledCapabilities,
      widgetBranding: config.widgetBranding,
    }),
    [config],
  );
  const currentConfigSnapshot = useMemo(
    () => JSON.stringify({
      adminLanguage,
      botName: normalizedBotName,
      botTone,
      botGoal,
      responseStyle,
      welcomeMessage: normalizedWelcomeMessage,
      enabledCapabilities: {
        answerProducts: answerProducts === "true",
        answerPolicies: answerPolicies === "true",
        answerOrders: answerOrders === "true",
        recommendProducts: recommendProducts === "true",
        captureLeads: captureLeads === "true",
      },
      widgetBranding: {
        primaryColor: normalizedPrimaryColor,
        launcherPosition,
        avatarStyle,
        launcherLabel: normalizedLauncherLabel,
      },
    }),
    [
      adminLanguage,
      answerOrders,
      answerPolicies,
      answerProducts,
      avatarStyle,
      botGoal,
      normalizedBotName,
      botTone,
      captureLeads,
      normalizedLauncherLabel,
      launcherPosition,
      normalizedPrimaryColor,
      recommendProducts,
      responseStyle,
      normalizedWelcomeMessage,
    ],
  );
  const hasUnsavedChanges = currentConfigSnapshot !== persistedConfigSnapshot;

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
    if (step >= 3) {
      setIsPreviewChatOpen(true);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 4) {
      setSyncPreviewProgress(18);
      return;
    }

    const values = [22, 41, 63, 79, 91];
    let index = 0;
    setSyncPreviewProgress(values[index]);

    const interval = window.setInterval(() => {
      index = (index + 1) % values.length;
      setSyncPreviewProgress(values[index]);
    }, 900);

    return () => window.clearInterval(interval);
  }, [step]);

  const handleStepClick = (targetStep: number) => {
    if (targetStep === step) return;
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(targetStep));

    if (!formRef.current || !hasUnsavedChanges) {
      window.location.href = url.toString();
      return;
    }

    autoSaveRequestRef.current?.abort();

    const formData = new FormData(formRef.current);
    formData.set("intent", "save_only");
    formData.set("responseMode", "json");

    const xhr = new XMLHttpRequest();
    autoSaveRequestRef.current = xhr;
    xhr.open("POST", url.toString(), true);
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.onload = () => {
      autoSaveRequestRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        window.location.href = url.toString();
      }
    };
    xhr.onerror = () => {
      autoSaveRequestRef.current = null;
      window.location.href = url.toString();
    };
    xhr.send(formData);
  };

  // Auto-save with debounce when user changes input values
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    if (!hasUnsavedChanges || !formRef.current || isSubmitting) {
      return () => {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
      };
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      if (!formRef.current || isSubmitting) {
        return;
      }

      autoSaveRequestRef.current?.abort();

      const formData = new FormData(formRef.current);
      formData.set("intent", "save_only");
      formData.set("responseMode", "json");

      const xhr = new XMLHttpRequest();
      autoSaveRequestRef.current = xhr;
      xhr.open("POST", window.location.href, true);
      xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
      xhr.onload = () => {
        if (autoSaveRequestRef.current === xhr) {
          autoSaveRequestRef.current = null;
        }
      };
      xhr.onerror = () => {
        if (autoSaveRequestRef.current === xhr) {
          autoSaveRequestRef.current = null;
        }
      };
      xhr.send(formData);
    }, 1500);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveRequestRef.current?.abort();
      autoSaveRequestRef.current = null;
    };
  }, [hasUnsavedChanges, isSubmitting, currentConfigSnapshot]);

  const stepTitles = [
    copy.languageTitle,
    copy.profileTitle,
    copy.brandingTitle,
    copy.activateTitle,
  ];
  const currentStepTitle = stepTitles[step - 1] ?? copy.stepLabel;
  const nextStepTitle = step < TOTAL_STEPS ? stepTitles[step] : null;

  const sectionProgress = [
    {
      key: "identity",
      title: adminLanguage === "es" ? "Fase 01" : "Phase 01",
      label: copy.languageTitle,
      start: 1,
      end: 1,
    },
    {
      key: "brain",
      title: adminLanguage === "es" ? "Fase 02" : "Phase 02",
      label: copy.profileTitle,
      start: 2,
      end: 2,
    },
    {
      key: "style",
      title: adminLanguage === "es" ? "Fase 03" : "Phase 03",
      label: copy.brandingTitle,
      start: 3,
      end: 3,
    },
    {
      key: "launch",
      title: adminLanguage === "es" ? "Fase 04" : "Phase 04",
      label: copy.activateTitle,
      start: 4,
      end: 4,
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
  const previewQuickReplies = capabilitySummary
    .filter((item) => item.enabled)
    .map((item) => {
      if (item.label === "Productos" || item.label === "Products") {
        return adminLanguage === "es" ? "Recomiendame algo" : "Recommend something";
      }
      if (item.label === "Politicas" || item.label === "Policies") {
        return adminLanguage === "es" ? "Politica de envios" : "Shipping policy";
      }
      if (item.label === "Pedidos" || item.label === "Orders") {
        return adminLanguage === "es" ? "Seguir mi pedido" : "Track my order";
      }
      if (item.label === "Recomendaciones" || item.label === "Recommendations") {
        return adminLanguage === "es" ? "Comparar opciones" : "Compare options";
      }
      return adminLanguage === "es" ? "Hablar con ventas" : "Talk to sales";
    })
    .slice(0, 4);

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

  const previewThemeStyle = useMemo(
    () => ({ ["--fluxbot-primary-color" as string]: normalizedPrimaryColor } as CSSProperties),
    [normalizedPrimaryColor],
  );

  const stepFrameClass = stepDirection === "forward"
    ? "onb-step-frame onb-step-frame-forward"
    : stepDirection === "backward"
      ? "onb-step-frame onb-step-frame-backward"
      : "onb-step-frame onb-step-frame-neutral";

  const renderMockChatPreview = () => {
    const previewTitle = normalizedBotName;
    const previewSubtitle = adminLanguage === "es"
      ? `En linea · ${previewGoalTag}`
      : `Online · ${previewGoalTag}`;
    const previewOpenLabel = adminLanguage === "es" ? "Abrir chat" : "Open chat";
    const previewCloseLabel = adminLanguage === "es" ? "Cerrar chat" : "Close chat";
    const previewFooterLabel = adminLanguage === "es" ? "Desarrollado por FluxBot" : "Powered by FluxBot";
    const previewProductButtonLabel = adminLanguage === "es" ? "Anadir al carrito" : "Add to cart";
    const previewLauncherClassName = `fluxbot-launcher fluxbot-launcher--${launcherPosition}${
      isPreviewChatOpen ? " fluxbot-launcher--open" : ""
    }`;
    const previewChatWindowClassName = `fluxbot-chat-window ${
      launcherPosition === "bottom-left" ? "onb-preview-chat-window-left" : "onb-preview-chat-window-right"
    }`;

    const previewLauncherAriaLabel = isPreviewChatOpen
      ? previewCloseLabel
      : `${previewOpenLabel}: ${normalizedLauncherLabel}`;

      return (
        <div className="onb-preview-card">
          <p className="onb-preview-kicker">{adminLanguage === "es" ? "Vista previa" : "Live preview"}</p>

        <div className="onb-preview-stage" style={previewThemeStyle}>
          <div
            id="fluxbot-preview-chat-window"
            className={previewChatWindowClassName}
            role="dialog"
            aria-modal="true"
            aria-label={adminLanguage === "es" ? "Ventana de chat" : "Chat window"}
            hidden={!isPreviewChatOpen}
            style={{ display: isPreviewChatOpen ? "flex" : "none" }}
          >
              <div className="fluxbot-chat-window__header">
                <div className="fluxbot-chat-window__header-content">
                  <h2 className="fluxbot-chat-window__title">{previewTitle}</h2>
                  <p className="fluxbot-chat-window__subtitle">{previewSubtitle}</p>
                </div>
                <button
                  type="button"
                  className="fluxbot-chat-window__close"
                  aria-label={previewCloseLabel}
                  onClick={() => setIsPreviewChatOpen(false)}
                >
                  <PreviewCloseIcon size={20} />
                </button>
              </div>

              <div className="fluxbot-chat-window__messages">
                {step === 1 ? (
                  <div className="fluxbot-message fluxbot-message--assistant">
                    <div className="fluxbot-message__content">{normalizedWelcomeMessage}</div>
                  </div>
                ) : (
                  <>
                    <div className="fluxbot-message fluxbot-message--user">
                      <div className="fluxbot-message__content">{previewUserMessage}</div>
                    </div>

                    <div className="fluxbot-message fluxbot-message--assistant">
                      <div className="fluxbot-message__content">{previewAssistantMessage}</div>
                    </div>

                    {previewQuickReplies.length > 0 ? (
                      <div className="onb-quick-replies">
                        {previewQuickReplies.map((reply) => (
                          <span key={reply} className="onb-quick-reply">
                            {reply}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {answerProducts === "true" ? (
                      <div className="fluxbot-product-cards">
                        <div className="fluxbot-product-card">
                          <div className="fluxbot-product-card__link">
                            <div className="fluxbot-product-card__info">
                              <div className="fluxbot-product-card__title">Flux Shell Lite</div>
                              <div className="fluxbot-product-card__price">EUR 79</div>
                              <div className="fluxbot-product-card__actions">
                                <button type="button" className="fluxbot-product-card__add">
                                  {previewProductButtonLabel}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="fluxbot-chat-window__input">
                <form className="fluxbot-chat-form" onSubmit={(event) => event.preventDefault()}>
                  <input
                    type="text"
                    className="fluxbot-chat-form__input"
                      placeholder={step === 2
                        ? (adminLanguage === "es" ? "Prueba una pregunta de cliente..." : "Try a shopper question...")
                        : (adminLanguage === "es" ? "Escribe tu mensaje..." : "Type your message...")}
                    aria-label={adminLanguage === "es" ? "Escribe tu mensaje" : "Type your message"}
                    readOnly
                  />
                  <button
                    type="button"
                    className="fluxbot-chat-form__submit"
                    aria-label={adminLanguage === "es" ? "Enviar mensaje" : "Send message"}
                  >
                    <PreviewSendIcon />
                  </button>
                </form>
              </div>

              <div className="fluxbot-chat-window__footer">
                <span className="fluxbot-chat-window__branding">{previewFooterLabel}</span>
              </div>
            </div>

          <div className={`onb-preview-launcher ${previewLauncherClassName}`}>
            <button
              type="button"
              className="fluxbot-launcher__button"
              onClick={() => setIsPreviewChatOpen((current) => !current)}
              aria-expanded={isPreviewChatOpen}
              aria-label={previewLauncherAriaLabel}
              aria-controls="fluxbot-preview-chat-window"
            >
              <PreviewLauncherChatIcon avatarStyle={avatarStyle} />
              <PreviewCloseIcon className="fluxbot-launcher__icon fluxbot-launcher__icon--close" />
            </button>
            <span className="fluxbot-launcher__label" hidden={!normalizedLauncherLabel} aria-hidden="true">
              {normalizedLauncherLabel}
            </span>
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
              ? "Haz que el bot deje de ser codigo: elige idioma, nombre y saludo para tu primera impresion."
              : "Turn the bot into a real teammate: choose language, name, and greeting for the first impression."}
          </p>

          <FormLayout>
            <Select
              label={adminLanguage === "es" ? "¿En que idioma atenderas?" : "Which language will you use?"}
              options={[
                { label: "Espanol", value: "es" },
                { label: "English", value: "en" },
              ]}
              value={adminLanguage}
              onChange={(value) => setAdminLanguage(value as AdminLanguage)}
            />

            <TextField
              label={adminLanguage === "es" ? "Dale un nombre a tu asistente" : "Give your assistant a name"}
              value={botName}
              onChange={setBotName}
              autoComplete="off"
              placeholder={getDefaultBotName(adminLanguage)}
            />

            <TextField
              label={adminLanguage === "es" ? "Tu primer saludo" : "Your first greeting"}
              value={welcomeMessage}
              onChange={setWelcomeMessage}
              autoComplete="off"
              multiline={3}
              placeholder={getDefaultWelcomeMessage(adminLanguage, normalizedBotName)}
            />
          </FormLayout>

          <div className="onb-note-grid">
            <div className="onb-note-card">
              <p className="onb-note-title">{adminLanguage === "es" ? "Valores inteligentes" : "Smart defaults"}</p>
              <p className="onb-note-text">
                {adminLanguage === "es"
                  ? `Si no escribes nada, usaremos "${getDefaultBotName(adminLanguage)}" y un saludo listo para publicar.`
                  : `If you leave it blank, we'll use "${getDefaultBotName(adminLanguage)}" and a launch-ready greeting.`}
              </p>
            </div>
            <div className="onb-note-card">
              <p className="onb-note-title">{adminLanguage === "es" ? "Preview en vivo" : "Live preview"}</p>
              <p className="onb-note-text">
                {adminLanguage === "es"
                  ? "La cabecera del chat y la burbuja de bienvenida cambian al instante mientras configuras."
                  : "The chat header and welcome bubble update instantly while you configure it."}
              </p>
            </div>
          </div>
        </BlockStack>
      );
    }

    if (step === 2) {
      return (
        <BlockStack gap="300">
          <h2 className="onb-step-headline">{copy.profileTitle}</h2>
          <p className="onb-step-copy">
            {adminLanguage === "es"
              ? "Define la mision y los superpoderes del bot para que responda como una IA util desde el dia uno."
              : "Define the bot mission and superpowers so it behaves like a useful AI teammate from day one."}
          </p>

          <BlockStack gap="200">
            <Text as="span" variant="bodyMd" fontWeight="medium">
              {adminLanguage === "es" ? "¿Cual es su mision?" : "What's its mission?"}
            </Text>
            <div className="onb-choice-grid onb-choice-grid-3">
              {[
                {
                  value: "SALES",
                  title: adminLanguage === "es" ? "Vender productos" : "Sell products",
                  description: adminLanguage === "es" ? "Mas foco en conversion y recomendaciones." : "More focus on conversion and recommendations.",
                },
                {
                  value: "SUPPORT",
                  title: adminLanguage === "es" ? "Resolver dudas" : "Handle support",
                  description: adminLanguage === "es" ? "Prioriza preguntas frecuentes y pedidos." : "Prioritizes FAQs and order help.",
                },
                {
                  value: "SALES_SUPPORT",
                  title: adminLanguage === "es" ? "Ambas" : "Both",
                  description: adminLanguage === "es" ? "El equilibrio ideal para una primera version." : "The ideal balance for a first launch.",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`onb-choice-card ${botGoal === option.value ? "onb-choice-card-active" : ""}`}
                  onClick={() => setBotGoal(option.value as BotGoal)}
                >
                  <span className="onb-choice-title">{option.title}</span>
                  <span className="onb-choice-description">{option.description}</span>
                </button>
              ))}
            </div>
          </BlockStack>

          <FormLayout>
            <Select
              label={adminLanguage === "es" ? "Tono de voz" : "Voice tone"}
              options={[
                { label: adminLanguage === "es" ? "Amigable" : "Friendly", value: "friendly" },
                { label: adminLanguage === "es" ? "Profesional" : "Professional", value: "professional" },
                { label: adminLanguage === "es" ? "Directo" : "Direct", value: "concise" },
                { label: adminLanguage === "es" ? "Comercial" : "Sales-focused", value: "sales" },
              ]}
              value={botTone}
              onChange={(value) => setBotTone(value as BotTone)}
            />
          </FormLayout>

          <BlockStack gap="200">
            <Text as="span" variant="bodyMd" fontWeight="medium">
              {adminLanguage === "es" ? "¿Que superpoderes tendra tu bot?" : "Which superpowers should your bot have?"}
            </Text>
            <div className="onb-choice-grid">
              {[
                {
                  value: answerProducts === "true",
                  onToggle: () => setAnswerProducts(answerProducts === "true" ? "false" : "true"),
                  title: adminLanguage === "es" ? "Responder sobre productos" : "Product answers",
                  description: adminLanguage === "es" ? "Usa catalogo y fichas para contestar dudas." : "Uses catalog data to answer product questions.",
                },
                {
                  value: recommendProducts === "true",
                  onToggle: () => setRecommendProducts(recommendProducts === "true" ? "false" : "true"),
                  title: adminLanguage === "es" ? "Recomendar productos" : "Recommend products",
                  description: adminLanguage === "es" ? "Sugiere articulos y alternativas en la conversacion." : "Suggests items and alternatives in the conversation.",
                },
                {
                  value: answerOrders === "true",
                  onToggle: () => setAnswerOrders(answerOrders === "true" ? "false" : "true"),
                  title: adminLanguage === "es" ? "Consultar pedidos" : "Track orders",
                  description: adminLanguage === "es" ? "Ayuda con estado y seguimiento de pedidos." : "Helps shoppers with order status and tracking.",
                },
                {
                  value: answerPolicies === "true",
                  onToggle: () => setAnswerPolicies(answerPolicies === "true" ? "false" : "true"),
                  title: adminLanguage === "es" ? "Politicas de envio" : "Shipping policies",
                  description: adminLanguage === "es" ? "Responde sobre envios, cambios y devoluciones." : "Answers shipping, exchange, and return questions.",
                },
                {
                  value: captureLeads === "true",
                  onToggle: () => setCaptureLeads(captureLeads === "true" ? "false" : "true"),
                  title: adminLanguage === "es" ? "Capturar leads" : "Capture leads",
                  description: adminLanguage === "es" ? "Recoge email o intencion comercial para seguimiento." : "Captures shopper intent for follow-up.",
                },
              ].map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className={`onb-choice-card ${item.value ? "onb-choice-card-active" : ""}`}
                  onClick={item.onToggle}
                >
                  <span className="onb-choice-title">{item.title}</span>
                  <span className="onb-choice-description">{item.description}</span>
                </button>
              ))}
            </div>
          </BlockStack>

          <div className="onb-note-card">
            <p className="onb-note-title">{adminLanguage === "es" ? "Asi sonara" : "This is how it will sound"}</p>
            <p className="onb-note-text">{tonePreview[botTone]}</p>
          </div>
        </BlockStack>
      );
    }

    if (step === 3) {
      return (
        <BlockStack gap="300">
          <h2 className="onb-step-headline">{copy.brandingTitle}</h2>
          <p className="onb-step-copy">
            {adminLanguage === "es"
              ? "Haz que el widget parezca nativo de tu tienda con color, avatar y posicion listos para publicar."
              : "Make the widget feel native to your store with color, avatar, and launcher position ready to publish."}
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

            <div className="onb-color-presets">
              {["#008060", "#111827", "#4F46E5", "#F59E0B"].map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`onb-color-swatch ${normalizedPrimaryColor === color ? "onb-color-swatch-active" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setPrimaryColor(color)}
                  aria-label={`${adminLanguage === "es" ? "Usar color" : "Use color"} ${color}`}
                />
              ))}
            </div>

            <BlockStack gap="200">
              <Text as="span" variant="bodyMd" fontWeight="medium">
                {adminLanguage === "es" ? "Avatar" : "Avatar"}
              </Text>
              <div className="onb-choice-grid onb-choice-grid-3">
                {[
                  { value: "assistant", label: adminLanguage === "es" ? "Robot" : "Robot" },
                  { value: "spark", label: adminLanguage === "es" ? "Destello IA" : "AI spark" },
                  { value: "store", label: adminLanguage === "es" ? "Logo de tienda" : "Store mark" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`onb-choice-card ${avatarStyle === option.value ? "onb-choice-card-active" : ""}`}
                    onClick={() => setAvatarStyle(option.value as "assistant" | "spark" | "store")}
                  >
                    <span className="onb-choice-title">{option.label}</span>
                  </button>
                ))}
              </div>
            </BlockStack>

            <BlockStack gap="200">
              <Text as="span" variant="bodyMd" fontWeight="medium">
                {adminLanguage === "es" ? "Posicion del launcher" : "Launcher position"}
              </Text>
              <div className="onb-choice-grid onb-choice-grid-2">
                {[
                {
                  label: adminLanguage === "es" ? "Inferior derecha" : "Bottom right",
                  value: "bottom-right",
                },
                {
                  label: adminLanguage === "es" ? "Inferior izquierda" : "Bottom left",
                  value: "bottom-left",
                },
              ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`onb-choice-card ${launcherPosition === option.value ? "onb-choice-card-active" : ""}`}
                    onClick={() => setLauncherPosition(option.value as "bottom-right" | "bottom-left")}
                  >
                    <span className="onb-choice-title">{option.label}</span>
                  </button>
                ))}
              </div>
            </BlockStack>

            <TextField
              label={adminLanguage === "es" ? "Texto del launcher" : "Launcher label"}
              value={launcherLabel}
              onChange={setLauncherLabel}
              autoComplete="off"
              placeholder={normalizedBotName}
            />
          </FormLayout>

          <div
            className={`onb-widget-preview onb-widget-preview-launcher ${
              launcherPosition === "bottom-left" ? "onb-launcher-left" : "onb-launcher-right"
            }`}
            style={previewThemeStyle}
          >
            <div className={`fluxbot-launcher fluxbot-launcher--${launcherPosition}`}>
              <button
                type="button"
                className="fluxbot-launcher__button"
                aria-label={`${adminLanguage === "es" ? "Abrir chat" : "Open chat"}: ${normalizedLauncherLabel}`}
              >
                <PreviewLauncherChatIcon avatarStyle={avatarStyle} />
                <PreviewCloseIcon className="fluxbot-launcher__icon fluxbot-launcher__icon--close" />
              </button>
              <span className="fluxbot-launcher__label" hidden={!normalizedLauncherLabel} aria-hidden="true">
                {normalizedLauncherLabel}
              </span>
            </div>
            <p className="onb-widget-copy">
              {adminLanguage === "es"
                ? `Launcher "${normalizedLauncherLabel}" listo en ${launcherPosition === "bottom-left" ? "inferior izquierda" : "inferior derecha"}.`
                : `Launcher "${normalizedLauncherLabel}" ready on ${launcherPosition === "bottom-left" ? "bottom left" : "bottom right"}.`}
            </p>
          </div>
        </BlockStack>
      );
    }

    return (
      <BlockStack gap="300">
        <h2 className="onb-step-headline">{copy.activateTitle}</h2>
        <p className="onb-step-copy">{copy.activateText}</p>

        <div className="onb-sync-card">
          <div className="onb-sync-head">
            <div>
              <p className="onb-note-title">
                {adminLanguage === "es" ? "Sincronizando productos y politicas..." : "Syncing catalog and policies..."}
              </p>
              <p className="onb-note-text">
                {adminLanguage === "es"
                  ? "Tu asistente quedara listo para responder con contexto real de la tienda."
                  : "Your assistant will be ready to answer with real store context."}
              </p>
            </div>
            <span className="onb-sync-badge">
              {adminLanguage === "es" ? "IA pensando" : "AI thinking"}
            </span>
          </div>
          <ProgressBar progress={syncPreviewProgress} size="small" />
        </div>

        <div className="onb-summary-grid">
          <div className="onb-note-card">
            <p className="onb-note-title">{adminLanguage === "es" ? "Identidad" : "Identity"}</p>
            <List>
              <List.Item>{`${adminLanguage === "es" ? "Idioma" : "Language"}: ${adminLanguage === "es" ? "Espanol" : "English"}`}</List.Item>
              <List.Item>{`${adminLanguage === "es" ? "Nombre" : "Name"}: ${normalizedBotName}`}</List.Item>
              <List.Item>{`${adminLanguage === "es" ? "Saludo" : "Greeting"}: ${normalizedWelcomeMessage}`}</List.Item>
            </List>
          </div>

          <div className="onb-note-card">
            <p className="onb-note-title">{adminLanguage === "es" ? "Cerebro" : "Brain"}</p>
            <List>
              <List.Item>{`${adminLanguage === "es" ? "Mision" : "Mission"}: ${previewGoalTag}`}</List.Item>
              <List.Item>{`${adminLanguage === "es" ? "Tono" : "Tone"}: ${botTone}`}</List.Item>
              <List.Item>{`${adminLanguage === "es" ? "Color" : "Color"}: ${normalizedPrimaryColor}`}</List.Item>
            </List>
          </div>
        </div>

        <div className="onb-chip-row">
          {capabilitySummary
            .filter((item) => item.enabled)
            .map((item) => (
              <span key={item.label} className="onb-chip onb-chip-on">
                {item.label}
              </span>
            ))}
        </div>

        <div className="onb-note-card onb-note-card-highlight">
          <p className="onb-note-title">{adminLanguage === "es" ? "Momento Aha" : "Aha moment"}</p>
          <p className="onb-note-text">{copy.activatedMessage}</p>
        </div>
      </BlockStack>
    );
  };

  return (
    <Page fullWidth>
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
                <div className="onb-progress-head">
                  <div>
                    <p className="onb-progress-title">{copy.progressLabel}</p>
                    <p className="onb-progress-step-name">{currentStepTitle}</p>
                  </div>
                  <p className="onb-progress-value">{`${progress}%`}</p>
                </div>
                <ProgressBar progress={progress} size="small" />
                <div className="onb-progress-meta">
                  <p className="onb-progress-hint">{`${copy.stepLabel} ${step}/${totalSteps}`}</p>
                  <p className="onb-progress-next">
                    {nextStepTitle
                      ? `${adminLanguage === "es" ? "Siguiente" : "Next"}: ${nextStepTitle}`
                      : (adminLanguage === "es" ? "Listo para activar tu asistente." : "Ready to activate your assistant.")}
                  </p>
                </div>
                <p className="onb-progress-caption">
                  {adminLanguage === "es"
                    ? "Configuracion guiada con guardado automatico y vista previa en tiempo real."
                    : "Guided setup with autosave and live preview as you move through the steps."}
                </p>
              </div>
            </div>
          </Layout.Section>

          <Layout.Section>
            <div className={`onb-content-stage ${step === TOTAL_STEPS ? "onb-content-stage-full" : ""}`}>
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

                        <HiddenOnboardingInputs
                          adminLanguage={adminLanguage}
                          botName={normalizedBotName}
                          botTone={botTone}
                          botGoal={botGoal}
                          responseStyle={responseStyle}
                          welcomeMessage={normalizedWelcomeMessage}
                          answerProducts={answerProducts === "true"}
                          answerPolicies={answerPolicies === "true"}
                          answerOrders={answerOrders === "true"}
                          recommendProducts={recommendProducts === "true"}
                          captureLeads={captureLeads === "true"}
                          primaryColor={normalizedPrimaryColor}
                          launcherPosition={launcherPosition}
                          avatarStyle={avatarStyle}
                          launcherLabel={normalizedLauncherLabel}
                        />

                        <div key={`step-${step}`} className={stepFrameClass}>
                          <BlockStack gap="300">
                            {renderStepBody()}
                          </BlockStack>
                        </div>

                        <div className="onb-nav-row">
                          <div className="onb-nav-actions">
                            {step > 1 ? (
                              <button
                                type="button"
                                className="onb-nav-button"
                                disabled={isSubmitting}
                                onClick={() => handleStepClick(step - 1)}
                              >
                                {copy.back}
                              </button>
                            ) : (
                              <span className="onb-nav-spacer" />
                            )}

                            {step < TOTAL_STEPS ? (
                              <button
                                type="button"
                                className="onb-nav-button onb-nav-button-primary"
                                disabled={isSubmitting}
                                onClick={() => handleStepClick(step + 1)}
                              >
                                {copy.next}
                              </button>
                            ) : (
                              <button
                                type="submit"
                                name="intent"
                                value="complete"
                                className="onb-nav-button onb-nav-button-primary"
                                disabled={isSubmitting}
                              >
                                {copy.complete}
                              </button>
                            )}
                          </div>

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

              {step < TOTAL_STEPS ? (
                <div className="onb-preview-slot">
                  {renderMockChatPreview()}
                </div>
              ) : null}
            </div>
          </Layout.Section>
        </Layout>
      </div>
    </Page>
  );
}
