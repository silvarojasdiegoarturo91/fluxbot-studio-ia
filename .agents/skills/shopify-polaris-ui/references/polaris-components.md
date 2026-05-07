---
name: shopify-onboarding-guide
description: Reference guide for Shopify Polaris components and onboarding patterns. Use when building onboarding flows or implementing Polaris UI components.
---

# Shopify Polaris Component Reference

## Essential Imports

```tsx
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  Select,
  Banner,
  EmptyState,
  List,
  Icon,
  Spinner,
  Modal,
  Tabs,
  ChoiceList,
  Checkbox,
  RadioButton,
  Link,
} from '@shopify/polaris';

import { NoteIcon, CircleTickIcon } from '@shopify/polaris-icons';
```

## Page Structure

```
Page
└── Layout
    ├── Layout.AnnotatedSection (with title/description)
    │   └── Card
    │       └── FormLayout
    └── Layout.Section
        └── Card (standalone)
```

## Onboarding Best Practices

### Do's
- Keep onboarding under 5 steps
- Show clear progress indicators
- Allow skipping non-essential steps
- Provide immediate feedback on actions
- Use empty states to guide first actions
- Persist incomplete onboarding state

### Don'ts
- Don't ask for information not immediately needed
- Don't use complex forms during onboarding
- Don't force completion before app use
- Don't hide progress - be transparent

## Quick Start Templates

### 1. Welcome + Checklist Page
```tsx
<Page title="Welcome to FluxBot Studio">
  <Layout>
    <Layout.Section>
      <Card>
        <BlockStack gap="400">
          <InlineStack gap="200" align="center">
            <Icon source={CircleTickIcon} tone="success" />
            <Text as="h2" variant="headingMd">Setup Complete</Text>
          </InlineStack>
          
          <List type="number">
            <List.Item>Connect Shopify store</List.Item>
            <List.Item>Configure AI settings</List.Item>
            <List.Item>Add knowledge base</List.Item>
          </List>
          
          <InlineStack gap="200">
            <Button>View Dashboard</Button>
            <Button variant="plain">Skip tour</Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### 2. Empty State CTA
```tsx
<EmptyState
  heading="No knowledge base articles"
  image="https://cdn.shopify.com/s/files/..."
  action={{
    content: 'Add Article',
    onAction: () => navigate('/knowledge/new'),
  }}
>
  <Text tone="subdued">
    Add articles to train your AI assistant
  </Text>
</EmptyState>
```

### 3. Configuration Form
```tsx
<FormLayout>
  <FormLayout.Group>
    <TextField
      label="Store Name"
      value={storeName}
      onChange={setStoreName}
      autoComplete="organization"
    />
    <Select
      label="Language"
      options={[
        { label: 'English', value: 'en' },
        { label: 'Spanish', value: 'es' },
      ]}
      value={language}
      onChange={setLanguage}
    />
  </FormLayout.Group>
  
  <TextField
    label="Welcome Message"
    value={welcomeMessage}
    onChange={setWelcomeMessage}
    multiline={3}
    helpText="Shown when customers first interact with the bot"
  />
</FormLayout>
```

### 4. Success/Error Feedback
```tsx
// Success Banner
<Banner
  title="Settings saved"
  tone="success"
  action={{ content: 'View settings', onAction: () => {} }}
>
  Your changes have been applied successfully.
</Banner>

// Error Banner
<Banner
  title="Connection failed"
  tone="critical"
  action={{ content: 'Try again', onAction: retry }}
>
  Unable to connect to your Shopify store. Check your API credentials.
</Banner>

// Warning Banner
<Banner
  title="Review required"
  tone="warning"
>
  Complete your profile before publishing.
</Banner>
```

## Spacing Reference

| Size | Pixels | Use Case |
|------|--------|----------|
| 0 | 0px | Zero spacing |
| 1 | 4px | Tight inline spacing |
| 2 | 8px | Related elements |
| 3 | 12px | Form field gaps |
| 4 | 16px | Standard padding |
| 5 | 20px | Section padding |
| 6 | 24px | Card padding |
| 8 | 32px | Section gaps |
| 10+ | 40px+ | Major sections |

## Color Tokens

```
Text:     --p-color-text
Subdued:  --p-color-text-subdued  
Critical: --p-color-text-critical
Success:  --p-color-text-success
Warning:  --p-color-text-warning

Background: --p-color-bg
Fill:       --p-color-bg-fill
Border:     --p-color-border
```

## Typography Variants

```
Display: heading2xl, heading3xl
Heading: headingLg, headingMd, headingSm, headingXs
Body:    bodyLg, bodyMd, bodySm
Label:   labelLg, labelMd, labelSm
```

## Animation Guidelines

```tsx
// Use for loading states
<Spinner size="small" />

// Use for page transitions
const transition = { duration: '150ms', timingFunction: 'ease-in-out' };

// Avoid distracting animations during onboarding
// Keep transitions subtle and purposeful
```
