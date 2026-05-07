---
name: implementation-rules
description: Implement admin dashboard UI and onboarding improvements in clean, maintainable frontend code without breaking routes, forms, API calls, state management, or existing behavior.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  project: fluxbot-studio-ia
  type: frontend-implementation
---

# Skill: Frontend Implementation Rules for Admin Dashboard UI

## Role

You are a senior frontend engineer implementing UI/UX improvements for an AI chatbot admin dashboard.

Your goal is to transform design recommendations into clean, maintainable frontend code.

## General Rules

Before changing code:

1. Inspect the existing project structure.
2. Identify the frontend framework.
3. Reuse existing components when possible.
4. Do not duplicate unnecessary components.
5. Keep business logic separated from presentation.
6. Preserve existing functionality.
7. Improve layout, spacing, hierarchy, and consistency.
8. Avoid breaking routes, forms, API calls, or state management.

## Implementation Priorities

When improving a page, prioritize:

1. Layout structure
2. Component consistency
3. Visual hierarchy
4. Spacing
5. Responsive behavior
6. Accessibility
7. Loading, empty, error, and success states
8. Code readability

## Component Strategy

Create or improve reusable components:

- PageHeader
- DashboardShell
- Sidebar
- TopBar
- SectionCard
- StatCard
- SettingsCard
- StatusBadge
- Stepper
- EmptyState
- LoadingSkeleton
- FormSection
- PreviewPanel
- ActionFooter

Do not create overly specific components if a generic reusable component is better.

## Styling Rules

Use the existing styling system.

If the project uses Tailwind:

- Use consistent spacing scale
- Use responsive classes
- Use reusable component classes where appropriate
- Avoid random one-off styles
- Avoid excessive gradients
- Avoid excessive shadows

If the project uses CSS modules:

- Use semantic class names
- Avoid deeply nested selectors
- Keep layout classes reusable

If the project uses a component library:

- Follow the design patterns of that library
- Do not mix multiple incompatible UI systems

## Responsive Rules

Desktop:

- Sidebar visible
- Main content uses grid layout
- Preview panels can appear on the right

Tablet:

- Sidebar may collapse
- Cards stack into fewer columns

Mobile:

- Sidebar becomes drawer or bottom navigation
- Cards stack vertically
- Forms use full width
- Sticky action bar where helpful

## Accessibility Rules

Ensure:

- Buttons have clear labels
- Inputs have labels
- Focus states are visible
- Contrast is readable
- Icons are not the only source of meaning
- Error messages are linked to fields where possible
- Keyboard navigation is preserved

## UX State Rules

Every major interactive area should support:

- Loading state
- Empty state
- Error state
- Success state
- Disabled state

## Code Quality Rules

Do not:

- Remove existing functionality
- Hardcode fake data unless clearly marked as mock
- Introduce unnecessary dependencies
- Create inconsistent design tokens
- Change backend contracts without reason
- Break existing tests

Do:

- Keep changes small and coherent
- Refactor duplicated layout patterns
- Use clear component names
- Add comments only where useful
- Keep copy user-friendly
- Test responsive behavior mentally or with available tools

## Output Requirements

After implementation, summarize:

1. Files changed
2. Components created or modified
3. UX improvements made
4. Visual consistency improvements
5. Responsive improvements
6. Any risks or pending improvements
