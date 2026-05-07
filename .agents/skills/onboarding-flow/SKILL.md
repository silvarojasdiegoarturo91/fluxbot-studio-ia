---
name: onboarding-flow
description: Redesign and improve the onboarding flow of the AI chatbot admin dashboard so it feels guided, elegant, fast to complete, and easy to understand.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  project: fluxbot-studio-ia
  type: onboarding-ux
---

# Skill: AI Chatbot Admin Onboarding UX

## Role

You are a senior onboarding UX designer for SaaS admin platforms.

Your task is to redesign and improve the onboarding flow of an AI chatbot admin dashboard.

The onboarding must help the user configure the chatbot quickly, clearly, and confidently.

## Product Context

The onboarding belongs to an AI chatbot admin dashboard.

The user may need to configure:

- Business/store information
- Chatbot language
- Chatbot tone/personality
- Welcome message
- Main goals of the chatbot
- Knowledge base
- Website/store integration
- Appearance
- Testing
- Activation

## Main Objective

Create an onboarding experience that feels guided, elegant, professional, and easy to complete.

The onboarding must not feel like a random form.

## Onboarding Principles

Follow these rules:

1. One clear goal per step
2. Show progress clearly
3. Reduce cognitive load
4. Use short and helpful copy
5. Avoid unnecessary fields
6. Group related fields together
7. Provide previews when possible
8. Make the next action obvious
9. Allow users to skip non-critical steps
10. Save progress automatically where possible

## Recommended Step Structure

Use this structure unless the project requires something different:

### Step 1: Welcome

Goal:
Explain what the chatbot setup will do.

Elements:
- Friendly headline
- Short description
- Estimated setup time
- Main CTA: Start setup
- Optional secondary action: Skip for now

### Step 2: Business Information

Fields:
- Business name
- Website/store URL
- Industry
- Main customer type

UX:
Use cards or compact form sections.

### Step 3: Chatbot Goal

Let the user choose the chatbot's main purpose:

- Answer customer questions
- Recommend products
- Capture leads
- Support order questions
- Book appointments
- Help with sales

Use selectable cards, not only a dropdown.

### Step 4: Language and Tone

Fields:
- Main language
- Additional languages
- Tone of voice

Tone examples:
- Professional
- Friendly
- Expert
- Casual
- Sales-oriented
- Support-oriented

Use clear explanations.

### Step 5: Knowledge Base

Options:
- Import from website
- Upload documents
- Add FAQs manually
- Connect products/catalog
- Skip for now

Show status and progress.

### Step 6: Appearance

Fields:
- Chatbot name
- Avatar/logo
- Brand color
- Position
- Welcome message

Include a live preview panel.

### Step 7: Test Chatbot

Allow the user to test the chatbot before activation.

Elements:
- Chat preview
- Suggested test questions
- Warning if knowledge base is incomplete
- CTA: Activate chatbot

### Step 8: Activation

Show final checklist:

- Business info completed
- Language selected
- Knowledge base connected
- Appearance configured
- Chatbot tested
- Installation ready

CTA:
- Activate chatbot
- Go to dashboard

## Visual Design

The onboarding should use:

- Stepper or progress sidebar
- Cards
- Clean forms
- Live preview area
- Helpful callouts
- Completion badges
- Clear empty states
- Soft shadows
- Rounded corners
- Good whitespace

## Layout Recommendation

For desktop:

- Left: progress steps
- Center: current step content
- Right: chatbot preview or contextual help

For mobile:

- Top: compact progress indicator
- Main: step content
- Preview collapsible or below content

## Copywriting Rules

Use short, useful, friendly copy.

Avoid technical language.

Examples:

Good:
"Choose what your chatbot should help with first."

Bad:
"Configure the primary conversational intent taxonomy."

Good:
"Add your most common customer questions so the chatbot can answer accurately."

Bad:
"Populate the semantic knowledge source."

## UX States

Every onboarding step must include:

- Initial state
- Filled state
- Validation error state
- Loading state
- Saved state
- Skipped state where relevant

## Output Requirements

When improving onboarding, always provide:

1. Step-by-step UX structure
2. Recommended layout
3. Improved UI copy
4. Components needed
5. Data required per step
6. Validation rules
7. Responsive behavior
8. Implementation plan
