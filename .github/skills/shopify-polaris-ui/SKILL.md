---
name: shopify-polaris-ui
description: >-
  Expert in Shopify Polaris UI/UX design and app onboarding flows. Use when building
  Shopify app interfaces, creating onboarding experiences, using Polaris components,
  or designing merchant-focused admin interfaces. Covers Remix, Polaris, App Bridge,
  and Shopify app best practices. This skill extends the ui-ux-generic skill with
  Shopify-specific patterns and Polaris components.
---

# Shopify Polaris UI/UX Expert

> **Prerequisite**: See `ui-ux-generic` skill for general UI/UX principles.
> This skill applies those principles specifically to Shopify Polaris.

## When to Use This Skill

Use this skill when:
- Creating or improving Shopify app interfaces
- Building onboarding flows for Shopify apps
- Using Shopify Polaris components
- Designing merchant admin experiences
- Implementing App Bridge navigation
- Following Shopify UX best practices

---

## Core Principles

### 1. Merchant-First Design
Shopify merchants are busy. Design for:
- **Speed**: Complete tasks in fewer clicks
- **Clarity**: Obvious labels and actions
- **Confidence**: Clear feedback and confirmation
- **Recovery**: Easy error recovery

### 2. Consistency with Shopify Admin
Apps should feel native to Shopify Admin:
- Use Polaris design tokens and spacing
- Follow established navigation patterns
- Match Shopify's visual language
- Use Polaris icons (`@shopify/polaris-icons`)

### 3. Progressive Disclosure
Don't overwhelm new users:
- Start simple, reveal complexity gradually
- Show contextual help when needed
- Allow skipping optional setup
- Save state for incomplete flows

---

## Polaris Component Guidelines

### Layout Components

```
Page > Layout > Section > Card
```

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `Page` | Main container | `title`, `subtitle`, `actions` |
| `Layout` | Page sections | `annotatedSection`, `helpText` |
| `Card` | Content grouping | `sectioned`, ` subdued` |
| `BlockStack` | Vertical spacing | `gap`, `align` |
| `InlineStack` | Horizontal spacing | `gap`, `wrap` |

### Navigation

| Component | Use Case |
|-----------|----------|
| `PageNavigation` | Main app navigation |
| `Tabs` | Content switching within page |
| `Link` | In-context navigation |
| `Breadcrumbs` | Nested page hierarchy |

### Forms & Inputs

| Component | When to Use |
|-----------|-------------|
| `TextField` | Single-line text input |
| `TextArea` | Multi-line text |
| `Select` | Dropdown selection |
| `Checkbox` | Boolean toggle |
| `RadioButton` | Single choice from options |
| `ChoiceList` | Multiple choices |
| `InlineSpacer` | Form field spacing |

### Feedback & Status

| Component | Purpose |
|-----------|---------|
| `Banner` | Persistent information/warnings |
| `Toast` | Temporary success/error messages |
| `Spinner` | Loading states |
| `Skeleton` | Content loading placeholders |
| `ProgressBar` | Upload/process progress |

### Actions

| Component | Use Case |
|-----------|----------|
| `Button` | Primary/secondary actions |
| `ButtonGroup` | Related action buttons |
| `IconButton` | Compact actions |
| `BulkActions` | List item actions |

---

## Onboarding Flow Patterns

### Pattern 1: Setup Checklist
Best for: Apps requiring initial configuration

```
┌─────────────────────────────────────────┐
│  Welcome to [App Name]                  │
│                                         │
│  Complete setup to get started          │
│                                         │
│  ☑ Connect your store        ✓ Done    │
│  ◯ Configure preferences     → Setup   │
│  ◯ Add your first item       → Create │
│                                         │
│  [Skip for now]      [Continue]         │
└─────────────────────────────────────────┘
```

**Implementation:**
```tsx
import { Page, Layout, Card, List, Button, InlineStack } from '@shopify/polaris';

export function OnboardingChecklist({ steps, onComplete, onSkip }) {
  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingL">
                Welcome to FluxBot Studio
              </Text>
              <Text as="p" tone="subdued">
                Complete setup to get started with AI-powered customer support.
              </Text>
              
              <List type="bullet">
                {steps.map((step) => (
                  <List.Item key={step.id}>
                    <InlineStack gap="200" wrap={false} align="space-between">
                      <Text>{step.title}</Text>
                      {step.status === 'complete' ? (
                        <Icon source={CheckIcon} tone="success" />
                      ) : (
                        <Button variant="plain" onClick={step.onAction}>
                          {step.actionLabel}
                        </Button>
                      )}
                    </InlineStack>
                  </List.Item>
                ))}
              </List>

              <InlineStack gap="200">
                <Button onClick={onSkip} variant="plain">
                  Skip for now
                </Button>
                <Button onClick={onComplete} variant="primary">
                  Continue to app
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

### Pattern 2: Step Wizard
Best for: Multi-step configuration

**Rules:**
- Maximum 5 steps
- Show progress indicator
- Allow navigation back
- Validate before advancing
- Persist progress

```
┌─────────────────────────────────────────┐
│  ● ─── ○ ─── ○ ─── ○ ─── ○            │
│  1    2    3    4    5                 │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │     [Step Content]              │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Back]                    [Next →]    │
└─────────────────────────────────────────┘
```

**Implementation:**
```tsx
import { Page, Layout, Card, Stepper, BlockStack } from '@shopify/polaris';
import { useCallback, useState } from 'react';

interface WizardProps {
  steps: { title: string; content: React.ReactNode }[];
  onComplete: () => void;
}

export function OnboardingWizard({ steps, onComplete }: WizardProps) {
  const [activeStep, setActiveStep] = useState(0);

  const handleNext = useCallback(() => {
    if (activeStep < steps.length - 1) {
      setActiveStep(activeStep + 1);
    } else {
      onComplete();
    }
  }, [activeStep, steps.length, onComplete]);

  const handleBack = useCallback(() => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  }, [activeStep]);

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Stepper
                steps={steps.map((s) => s.title)}
                activeStep={activeStep}
                onStepClick={(step) => setActiveStep(step)}
              />
              
              <div role="tabpanel">
                {steps[activeStep].content}
              </div>

              <InlineStack gap="200" align="end">
                {activeStep > 0 && (
                  <Button onClick={handleBack}>Back</Button>
                )}
                <Button variant="primary" onClick={handleNext}>
                  {activeStep === steps.length - 1 ? 'Complete' : 'Next'}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

### Pattern 3: Empty State + Quick Action
Best for: Apps with simple initial setup

```
┌─────────────────────────────────────────┐
│                                         │
│           [Illustration]                │
│                                         │
│      No [items] yet                    │
│                                         │
│      [Description of what to add]      │
│                                         │
│      [+ Add your first item]           │
│                                         │
└─────────────────────────────────────────┘
```

**Implementation:**
```tsx
import { EmptyState, Card, Layout } from '@shopify/polaris';
import { NoteIcon } from '@shopify/polaris-icons';

export function EmptyStateExample({ onAction }) {
  return (
    <Layout>
      <Layout.Section>
        <Card>
          <EmptyState
            heading="No knowledge base articles yet"
            image="https://cdn.shopify.com/s/files/..."
            action={{
              content: 'Add your first article',
              onAction,
            }}
          >
            <Text as="p" tone="subdued">
              Add articles to train your AI assistant with your store knowledge.
            </Text>
          </EmptyState>
        </Card>
      </Layout.Section>
    </Layout>
  );
}
```

---

## Polaris Tokens Reference

### Spacing Scale
```
0: 0
1: 4px
2: 8px
3: 12px
4: 16px
5: 20px
6: 24px
8: 32px
10: 40px
12: 48px
16: 64px
```

### Color Roles
```css
--p-color-bg: background
--p-color-bg-fill: interactive backgrounds
--p-color-text: primary text
--p-color-text-subdued: secondary text
--p-color-text-critical: errors
--p-color-text-warning: warnings
--p-color-text-success: success
--p-color-icon: icons
--p-color-border: borders
```

### Typography Scale
```tsx
// Display
<Text variant="headingL" size="2xl">Display</Text>
<Text variant="headingXl" size="3xl">Hero</Text>

// Headings
<Text variant="headingMd" size="lg">Section</Text>
<Text variant="headingSm" size="md">Subsection</Text>

// Body
<Text variant="bodyLg">Large body</Text>
<Text variant="bodyMd">Medium body</Text>
<Text variant="bodySm">Small body</Text>

// Labels
<Text variant="labelLg">Large label</Text>
<Text variant="labelMd">Medium label</Text>
<Text variant="labelSm">Small label</Text>
```

---

## Accessibility Checklist

- [ ] All interactive elements are keyboard accessible
- [ ] Form inputs have associated labels
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Focus states are visible
- [ ] Error messages are announced to screen readers
- [ ] Loading states use `aria-busy`
- [ ] Modals trap focus correctly
- [ ] Skip links are provided for repetitive content

---

## App Bridge Integration

### Navigation Types
```tsx
import { useNavigation } from '@shopify/app-bridge-react';

// In-page navigation
const navigation = useNavigation();

// Navigate to different routes
navigation.dispatch(Navigation.Action.APP_PATH, '/settings');

// External links
navigation.dispatch(Navigation.Action.REMOTE, 'https://example.com');
```

### Modal Actions
```tsx
import { Modal, TitleBar, Button } from '@shopify/app-bridge-react';

function MyModal() {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Confirm Action"
    >
      <Modal.Section>
        <Text>Are you sure you want to proceed?</Text>
      </Modal.Section>
      
      <TitleBar
        title="Confirm Action"
        primaryAction={{
          content: 'Confirm',
          onAction: handleConfirm,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: onClose,
          },
        ]}
      />
    </Modal>
  );
}
```

---

## Common Patterns

### Card with Actions
```tsx
<Card>
  <BlockStack gap="400">
    <InlineStack align="space-between" wrap={false}>
      <Text as="h3" variant="headingSm">Settings</Text>
      <Button icon={EditIcon} variant="plain">Edit</Button>
    </InlineStack>
    
    <Text tone="subdued">
      Configure your app preferences
    </Text>
  </BlockStack>
</Card>
```

### Form Section
```tsx
<FormLayout>
  <FormLayout.Group>
    <TextField
      label="Store name"
      value={name}
      onChange={setName}
      autoComplete="organization"
    />
    <TextField
      label="Contact email"
      type="email"
      value={email}
      onChange={setEmail}
      autoComplete="email"
    />
  </FormLayout.Group>
  
  <Select
    label="Timezone"
    options={timezoneOptions}
    value={timezone}
    onChange={setTimezone}
  />
</FormLayout>
```

### Loading State
```tsx
function LoadingExample() {
  return (
    <BlockStack gap="400">
      <SkeletonBodyText lines={3} />
      <SkeletonThumbnail size="small" />
      <InlineStack gap="200">
        <SkeletonDisplayText size="small" />
        <SkeletonDisplayText size="small" />
      </InlineStack>
    </BlockStack>
  );
}
```

---

## Performance Tips

1. **Lazy load routes** in Remix
2. **Use `useClientEffect`** for client-only code
3. **Minimize re-renders** with `useMemo`/`useCallback`
4. **Optimize images** with Shopify CDN transforms
5. **Code split** Polaris imports if possible
6. **Use `defer`** for non-critical data

---

## Testing UX

### Checklist Before Launch
- [ ] Test on Shopify mobile app
- [ ] Verify all buttons/actions work
- [ ] Check form validation messages
- [ ] Test empty states
- [ ] Verify loading states
- [ ] Check error handling
- [ ] Test keyboard navigation
- [ ] Verify screen reader experience
- [ ] Test with slow network
- [ ] Verify internationalization
