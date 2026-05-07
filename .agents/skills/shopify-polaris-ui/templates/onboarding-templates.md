# Onboarding Templates

## Template 1: Welcome Card
```tsx
import { Page, Layout, Card, BlockStack, InlineStack, Text, Button } from '@shopify/polaris';

interface WelcomeCardProps {
  title: string;
  description: string;
  primaryAction: {
    content: string;
    onAction: () => void;
  };
  secondaryAction?: {
    content: string;
    onAction: () => void;
  };
}

export function WelcomeCard({ title, description, primaryAction, secondaryAction }: WelcomeCardProps) {
  return (
    <Page title={title}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400" align="center">
              <Text as="h2" variant="headingL" alignment="center">
                {title}
              </Text>
              <Text as="p" tone="subdued" alignment="center">
                {description}
              </Text>
              <InlineStack gap="200">
                {secondaryAction && (
                  <Button variant="plain" onClick={secondaryAction.onAction}>
                    {secondaryAction.content}
                  </Button>
                )}
                <Button variant="primary" onClick={primaryAction.onAction}>
                  {primaryAction.content}
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

## Template 2: Setup Checklist
```tsx
import { Page, Layout, Card, BlockStack, Text, List, Button, InlineStack, Icon } from '@shopify/polaris';
import { CheckIcon } from '@shopify/polaris-icons';

interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'complete';
  actionLabel?: string;
  onAction?: () => void;
}

interface SetupChecklistProps {
  heading: string;
  items: ChecklistItem[];
  onContinue: () => void;
  continueLabel?: string;
  canSkip?: boolean;
}

export function SetupChecklist({ 
  heading, 
  items, 
  onContinue, 
  continueLabel = 'Continue',
  canSkip = true 
}: SetupChecklistProps) {
  const completedCount = items.filter(i => i.status === 'complete').length;
  const allComplete = completedCount === items.length;

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">{heading}</Text>
              
              <List type="number">
                {items.map((item) => (
                  <List.Item key={item.id}>
                    <InlineStack gap="200" wrap={false} align="space-between">
                      <BlockStack gap="100">
                        <InlineStack gap="100" wrap={false}>
                          <Text>{item.title}</Text>
                          {item.status === 'complete' && (
                            <Icon source={CheckIcon} tone="success" />
                          )}
                        </InlineStack>
                        {item.description && (
                          <Text tone="subdued" variant="bodySm">
                            {item.description}
                          </Text>
                        )}
                      </BlockStack>
                      {item.status === 'pending' && item.actionLabel && (
                        <Button variant="plain" size="slim" onClick={item.onAction}>
                          {item.actionLabel}
                        </Button>
                      )}
                    </InlineStack>
                  </List.Item>
                ))}
              </List>

              <InlineStack gap="200" align="end">
                {canSkip && !allComplete && (
                  <Button variant="plain">Skip for now</Button>
                )}
                <Button variant="primary" onClick={onContinue} disabled={!allComplete}>
                  {allComplete ? continueLabel : `${completedCount}/${items.length} complete`}
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

## Template 3: Step Wizard
```tsx
import { useState, useCallback } from 'react';
import { Page, Layout, Card, BlockStack, Text, Button, InlineStack } from '@shopify/polaris';

interface WizardStep {
  title: string;
  description?: string;
  content: React.ReactNode;
  validate?: () => boolean | string;
}

interface StepWizardProps {
  steps: WizardStep[];
  onComplete: () => void;
  onStepChange?: (step: number) => void;
}

export function StepWizard({ steps, onComplete, onStepChange }: StepWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const currentStep = steps[activeStep];

  const handleNext = useCallback(() => {
    if (currentStep.validate) {
      const result = currentStep.validate();
      if (result !== true) {
        setErrors(Array.isArray(result) ? result : [result]);
        return;
      }
    }
    
    setErrors([]);
    
    if (activeStep < steps.length - 1) {
      const nextStep = activeStep + 1;
      setActiveStep(nextStep);
      onStepChange?.(nextStep);
    } else {
      onComplete();
    }
  }, [activeStep, steps.length, currentStep, onComplete, onStepChange]);

  const handleBack = useCallback(() => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
      setErrors([]);
      onStepChange?.(activeStep - 1);
    }
  }, [activeStep, onStepChange]);

  return (
    <Page title={currentStep.title}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              {/* Progress indicator */}
              <InlineStack gap="100" align="center">
                {steps.map((_, index) => (
                  <div
                    key={index}
                    style={{
                      width: index === activeStep ? '24px' : '8px',
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: index <= activeStep 
                        ? 'var(--p-color-bg-fill-interactive)' 
                        : 'var(--p-color-border)',
                      transition: 'all 150ms',
                    }}
                  />
                ))}
              </InlineStack>

              {/* Step content */}
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Step {activeStep + 1}: {currentStep.title}
                  </Text>
                  {currentStep.description && (
                    <Text tone="subdued">{currentStep.description}</Text>
                  )}
                </BlockStack>

                {errors.length > 0 && (
                  <Banner tone="critical" title="Please fix the following">
                    <List type="bullet">
                      {errors.map((error, i) => (
                        <List.Item key={i}>{error}</List.Item>
                      ))}
                    </List>
                  </Banner>
                )}

                {currentStep.content}
              </BlockStack>

              {/* Navigation */}
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

## Template 4: Empty State
```tsx
import { Page, Layout, Card, EmptyState } from '@shopify/polaris';

interface EmptyStateTemplateProps {
  heading: string;
  image?: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  secondaryAction?: {
    label: string;
    onAction: () => void;
  };
}

export function EmptyStateTemplate({
  heading,
  image,
  description,
  actionLabel,
  onAction,
  secondaryAction,
}: EmptyStateTemplateProps) {
  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <EmptyState
              heading={heading}
              image={image}
              action={{
                content: actionLabel,
                onAction,
              }}
              secondaryAction={
                secondaryAction
                  ? { content: secondaryAction.label, onAction: secondaryAction.onAction }
                  : undefined
              }
            >
              <p>{description}</p>
            </EmptyState>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## Template 5: Configuration Form
```tsx
import { useState } from 'react';
import { Page, Layout, Card, FormLayout, TextField, Select, BlockStack, Text, Button, InlineStack, Banner } from '@shopify/polaris';

interface ConfigFormProps {
  fields: {
    name: string;
    label: string;
    type: 'text' | 'email' | 'number' | 'select';
    options?: { label: string; value: string }[];
    required?: boolean;
    helpText?: string;
  }[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function ConfigurationForm({ fields, onSubmit, onCancel, submitLabel = 'Save' }: ConfigFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.name, '']))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    fields.forEach(field => {
      if (field.required && !values[field.name]?.trim()) {
        newErrors[field.name] = `${field.label} is required`;
      }
      if (field.type === 'email' && values[field.name]) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[field.name])) {
          newErrors[field.name] = 'Enter a valid email address';
        }
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await onSubmit(values);
      setSuccess(true);
    } catch (error) {
      setErrors({ _form: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page title="Configuration">
      <Layout>
        <Layout.Section>
          <Card>
            <FormLayout>
              {success && (
                <Banner tone="success" title="Configuration saved">
                  Your changes have been applied successfully.
                </Banner>
              )}

              {errors._form && (
                <Banner tone="critical">{errors._form}</Banner>
              )}

              <BlockStack gap="400">
                {fields.map(field => (
                  field.type === 'select' ? (
                    <Select
                      key={field.name}
                      label={field.label}
                      options={field.options || []}
                      value={values[field.name]}
                      onChange={(v) => handleChange(field.name, v)}
                      error={errors[field.name]}
                      helpText={field.helpText}
                    />
                  ) : (
                    <TextField
                      key={field.name}
                      label={field.label}
                      type={field.type}
                      value={values[field.name]}
                      onChange={(v) => handleChange(field.name, v)}
                      error={errors[field.name]}
                      helpText={field.helpText}
                      autoComplete={field.type === 'email' ? 'email' : 'off'}
                    />
                  )
                ))}
              </BlockStack>

              <InlineStack gap="200" align="end">
                {onCancel && (
                  <Button onClick={onCancel} disabled={loading}>
                    Cancel
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  loading={loading}
                >
                  {submitLabel}
                </Button>
              </InlineStack>
            </FormLayout>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## Template 6: Loading Skeleton
```tsx
import { Page, Layout, Card, BlockStack, SkeletonBodyText, SkeletonThumbnail, InlineStack, SkeletonDisplayText } from '@shopify/polaris';

export function LoadingSkeleton() {
  return (
    <Page title="Loading...">
      <Layout>
        <Layout.AnnotatedSection
          title="Overview"
          description="Loading your data"
        >
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" wrap={false}>
                <SkeletonDisplayText size="small" />
                <SkeletonThumbnail size="small" />
              </InlineStack>
              <SkeletonBodyText lines={3} />
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={4} />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## Template 7: Error State
```tsx
import { Page, Layout, Card, BlockStack, Text, Button, Banner, InlineStack } from '@shopify/polaris';
import { AlertCircleIcon } from '@shopify/polaris-icons';

interface ErrorStateProps {
  title: string;
  description?: string;
  error?: string;
  onRetry?: () => void;
  onContact?: () => void;
}

export function ErrorState({ title, description, error, onRetry, onContact }: ErrorStateProps) {
  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400" align="center">
              <InlineStack gap="200" wrap={false} align="center">
                <Icon source={AlertCircleIcon} tone="critical" />
                <Text as="h2" variant="headingMd">{title}</Text>
              </InlineStack>

              {description && (
                <Text tone="subdued" alignment="center">{description}</Text>
              )}

              {error && (
                <Banner tone="critical" title="Error details">
                  {error}
                </Banner>
              )}

              <InlineStack gap="200">
                {onRetry && (
                  <Button onClick={onRetry}>Try again</Button>
                )}
                {onContact && (
                  <Button variant="primary" onClick={onContact}>
                    Contact Support
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```
