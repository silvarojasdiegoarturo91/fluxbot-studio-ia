# Fudge Claude Code Setup

## Purpose
Mandatory companion guide for Claude Code setup and Shopify AI Toolkit workflows.

Primary source:
https://www.fudge.ai/guides/shopify-ai-toolkit-claude-code-setup/

## Non-negotiable rules
- Prefer the Shopify plugin path in Claude Code when available.
- Use manual skills only when the plugin path is unavailable or unnecessary.
- Set `OPT_OUT_INSTRUMENTATION=true` before validating proprietary code.
- Assume store operations are live immediately; there is no draft or undo.
- Always query current state before any mutation.
- Use the minimum OAuth scopes required for the operation.

## Scope
Apply to:
- Claude Code setup
- Shopify validation and store operations
- tests and mutations involving live store state
