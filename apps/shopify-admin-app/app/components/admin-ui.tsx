import { Badge, BlockStack, Button, Card, InlineStack, Text } from "@shopify/polaris";
import type { ReactNode } from "react";

export function AdminPageHeader(props: {
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  backUrl?: string;
  backLabel?: string;
}) {
  return (
    <div className="fb-admin-page-header">
      <div className="fb-admin-page-header-inner">
        <div>
          {props.eyebrow ? <p className="fb-admin-page-header-eyebrow">{props.eyebrow}</p> : null}
          <InlineStack gap="200" blockAlign="center" wrap>
            <h2 className="fb-admin-page-header-title">{props.title}</h2>
            {props.badge}
          </InlineStack>
          {props.description ? (
            <p className="fb-admin-page-header-description">{props.description}</p>
          ) : null}
        </div>

        <div className="fb-admin-page-header-actions">
          {props.backUrl && props.backLabel ? <Button url={props.backUrl}>{props.backLabel}</Button> : null}
          {props.actions}
        </div>
      </div>
    </div>
  );
}

export function AdminSectionCard(props: {
  title: string;
  description?: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="fb-admin-section-card">
        <BlockStack gap="300">
          <div className="fb-admin-section-header">
            <div>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="h2" variant="headingMd">
                  {props.title}
                </Text>
                {props.badge}
              </InlineStack>
              {props.description ? <p className="fb-admin-section-copy">{props.description}</p> : null}
            </div>
            {props.action}
          </div>
          <div className="fb-admin-section-body">{props.children}</div>
        </BlockStack>
      </div>
    </Card>
  );
}

export function AdminStatCard(props: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <Card>
      <div className="fb-admin-stat-card">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="start">
            <Text as="p" variant="bodySm" tone="subdued">
              {props.label}
            </Text>
            {props.badge}
          </InlineStack>
          <div className="fb-admin-stat-value">{props.value}</div>
          {props.meta ? <div className="fb-admin-stat-meta">{props.meta}</div> : null}
        </BlockStack>
      </div>
    </Card>
  );
}

export function AdminInfoCallout(props: {
  title: string;
  children: ReactNode;
  tone?: "default" | "highlight";
}) {
  return (
    <div className={`fb-admin-info-callout ${props.tone === "highlight" ? "fb-admin-info-callout-highlight" : ""}`}>
      <BlockStack gap="100">
        <Text as="h3" variant="headingSm">
          {props.title}
        </Text>
        <div className="fb-admin-info-callout-copy">{props.children}</div>
      </BlockStack>
    </div>
  );
}

export function AdminStatusBadge(props: {
  tone?: "success" | "info" | "attention" | "warning" | "critical" | "new";
  children: string;
}) {
  return <Badge tone={props.tone ?? "info"}>{props.children}</Badge>;
}
