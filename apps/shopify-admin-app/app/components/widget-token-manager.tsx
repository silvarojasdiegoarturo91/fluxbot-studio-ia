'use client';

import { useState, useEffect } from 'react';
import { Button, Card, BlockStack, InlineStack, Text, Badge, Modal, TextField } from '@shopify/polaris';
import styles from './widget-token-manager.module.css';

interface WidgetToken {
  id: string;
  token: string;
  label?: string;
  createdAt: string;
  revokedAt?: string;
}

interface WidgetTokenManagerProps {
  tenantId: string;
}

export function WidgetTokenManager({ tenantId }: WidgetTokenManagerProps) {
  const [tokens, setTokens] = useState<WidgetToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [tokenLabel, setTokenLabel] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchTokens();
  }, [tenantId]);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      // Mock fetch - will connect to real endpoint
      const mockTokens: WidgetToken[] = [
        {
          id: '1',
          token: 'fbw_live_abc123def456',
          label: 'Production',
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '2',
          token: 'fbw_live_xyz789uvw012',
          label: 'Staging',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];
      setTokens(mockTokens);
    } catch (error) {
      console.error('Failed to fetch tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateToken = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/v1/widget-admin/token/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, label: tokenLabel || undefined }),
      });

      if (!response.ok) throw new Error('Failed to generate token');

      const data = await response.json();
      const newToken: WidgetToken = {
        id: data.tokenId,
        token: data.token,
        label: data.label,
        createdAt: data.createdAt,
      };

      setTokens([...tokens, newToken]);
      setTokenLabel('');
      setShowGenerateModal(false);

      // Show feedback
      setTimeout(() => setCopyFeedback('Token copied to clipboard!'), 100);
    } catch (error) {
      console.error('Failed to generate token:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    try {
      const response = await fetch('/api/v1/widget-admin/token/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      });

      if (!response.ok) throw new Error('Failed to revoke token');

      setTokens(tokens.map(t =>
        t.id === tokenId ? { ...t, revokedAt: new Date().toISOString() } : t
      ));
      setConfirmRevoke(null);
    } catch (error) {
      console.error('Failed to revoke token:', error);
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopyFeedback('Copied!');
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const maskToken = (token: string) => {
    const last4 = token.slice(-4);
    return `${token.substring(0, 8)}...${last4}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={styles.container}>
      <BlockStack gap="400">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="headingMd">Tokens de Widget</Text>
          <Button
            onClick={() => setShowGenerateModal(true)}
            primary
            disabled={loading}
          >
            Generar Nuevo Token
          </Button>
        </div>

        {tokens.length === 0 ? (
          <Card>
            <Text>No hay tokens generados aún.</Text>
          </Card>
        ) : (
          <BlockStack gap="300">
            {tokens.map((token) => (
              <Card key={token.id}>
                <BlockStack gap="200">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Text variant="bodyMd" fontWeight="bold">
                        {token.label || 'Sin etiqueta'}
                      </Text>
                      <Text variant="bodySm" color="subdued">
                        {maskToken(token.token)}
                      </Text>
                    </div>
                    {token.revokedAt ? (
                      <Badge>Revocado</Badge>
                    ) : (
                      <Badge tone="success">Activo</Badge>
                    )}
                  </div>

                  <Text variant="bodySm" color="subdued">
                    Creado: {formatDate(token.createdAt)}
                    {token.revokedAt && ` • Revocado: ${formatDate(token.revokedAt)}`}
                  </Text>

                  {!token.revokedAt && (
                    <InlineStack gap="200">
                      <Button
                        onClick={() => handleCopyToken(token.token)}
                        plain
                      >
                        Copiar Token
                      </Button>
                      <Button
                        onClick={() => setConfirmRevoke(token.id)}
                        destructive
                        plain
                      >
                        Revocar
                      </Button>
                    </InlineStack>
                  )}
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        )}

        <Modal
          open={showGenerateModal}
          onClose={() => setShowGenerateModal(false)}
          title="Generar Nuevo Token"
          primaryAction={{
            content: 'Generar',
            onAction: handleGenerateToken,
            loading: isGenerating,
          }}
          secondaryActions={[
            {
              content: 'Cancelar',
              onAction: () => setShowGenerateModal(false),
            },
          ]}
        >
          <Modal.Section>
            <TextField
              label="Etiqueta (opcional)"
              placeholder="ej: Production, Staging"
              value={tokenLabel}
              onChange={setTokenLabel}
              autoComplete="off"
              helpText="Ayuda a identificar este token"
            />
          </Modal.Section>
        </Modal>

        <Modal
          open={confirmRevoke !== null}
          onClose={() => setConfirmRevoke(null)}
          title="Revocar Token"
          primaryAction={{
            content: 'Revocar',
            onAction: () => handleRevokeToken(confirmRevoke!),
            destructive: true,
          }}
          secondaryActions={[
            {
              content: 'Cancelar',
              onAction: () => setConfirmRevoke(null),
            },
          ]}
        >
          <Modal.Section>
            <Text>
              ¿Estás seguro de que quieres revocar este token? Las solicitudes con este token fallarán inmediatamente.
            </Text>
          </Modal.Section>
        </Modal>

        {copyFeedback && (
          <div style={{ padding: '12px', backgroundColor: '#e1f5e1', borderRadius: '4px' }}>
            <Text>{copyFeedback}</Text>
          </div>
        )}
      </BlockStack>
    </div>
  );
}
