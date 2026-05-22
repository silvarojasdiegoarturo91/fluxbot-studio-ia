'use client';

import { useState, useEffect } from 'react';
import { Button, Card, BlockStack, Text, TextField, Badge } from '@shopify/polaris';
import styles from './domain-manager.module.css';

interface Domain {
  domain: string;
  addedAt: string;
  trafficIndicator?: boolean;
}

interface DomainManagerProps {
  tenantId: string;
}

const DOMAIN_PATTERN = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export function DomainManager({ tenantId }: DomainManagerProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchDomains();
  }, [tenantId]);

  const fetchDomains = async () => {
    setLoading(true);
    try {
      // Mock fetch - will connect to real endpoint
      const mockDomains: Domain[] = [
        { domain: 'example.com', addedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), trafficIndicator: true },
        { domain: '*.example.com', addedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), trafficIndicator: false },
      ];
      setDomains(mockDomains);
    } catch (error) {
      console.error('Failed to fetch domains:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateDomain = (domain: string): boolean => {
    if (domain === 'localhost') return true;
    return DOMAIN_PATTERN.test(domain);
  };

  const handleAddDomain = async () => {
    setDomainError(null);

    if (!newDomain.trim()) {
      setDomainError('Por favor ingresa un dominio');
      return;
    }

    if (!validateDomain(newDomain.trim())) {
      setDomainError('Formato de dominio inválido. Usa: example.com o *.example.com');
      return;
    }

    if (domains.some(d => d.domain === newDomain.trim())) {
      setDomainError('Este dominio ya está en la lista');
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch('/api/v1/widget-admin/domain/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, domain: newDomain.trim() }),
      });

      if (!response.ok) throw new Error('Failed to add domain');

      const data = await response.json();
      const newDomainEntry: Domain = {
        domain: data.domain,
        addedAt: data.allowedAt,
      };

      setDomains([...domains, newDomainEntry]);
      setNewDomain('');
      setFeedbackMessage('Dominio agregado exitosamente');
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Failed to add domain:', error);
      setDomainError('Error al agregar dominio');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    try {
      const response = await fetch('/api/v1/widget-admin/domain/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, domain }),
      });

      if (!response.ok) throw new Error('Failed to remove domain');

      setDomains(domains.filter(d => d.domain !== domain));
      setFeedbackMessage('Dominio removido exitosamente');
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (error) {
      console.error('Failed to remove domain:', error);
    }
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
        <Text variant="headingMd">Dominios Permitidos</Text>

        <Card>
          <BlockStack gap="300">
            <Text variant="bodySm" color="subdued">
              Agrega los dominios donde el widget estará instalado. Usa *.example.com para subdominos.
            </Text>

            <BlockStack gap="200">
              <TextField
                label="Nuevo Dominio"
                placeholder="ejemplo: mydomain.com o *.mydomain.com"
                value={newDomain}
                onChange={setNewDomain}
                autoComplete="off"
                error={domainError ? true : false}
                helpText={domainError || 'El widget solo funcionará en dominios permitidos'}
                onBlur={() => {
                  if (newDomain && !validateDomain(newDomain)) {
                    setDomainError('Formato de dominio inválido');
                  }
                }}
              />

              <Button
                onClick={handleAddDomain}
                primary
                disabled={loading || isAdding || !newDomain.trim()}
                loading={isAdding}
              >
                Agregar Dominio
              </Button>
            </BlockStack>
          </BlockStack>
        </Card>

        {domains.length === 0 ? (
          <Card>
            <Text color="subdued">No hay dominios configurados aún.</Text>
          </Card>
        ) : (
          <BlockStack gap="200">
            {domains.map((domain) => (
              <Card key={domain.domain}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text variant="bodyMd" fontWeight="bold">
                      {domain.domain}
                    </Text>
                    <Text variant="bodySm" color="subdued">
                      Agregado: {formatDate(domain.addedAt)}
                    </Text>
                    {domain.trafficIndicator && (
                      <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '8px', height: '8px', backgroundColor: '#34a853', borderRadius: '50%' }} />
                        <Text variant="bodySm" color="success">
                          Tráfico detectado
                        </Text>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => handleRemoveDomain(domain.domain)}
                    destructive
                    plain
                  >
                    Eliminar
                  </Button>
                </div>
              </Card>
            ))}
          </BlockStack>
        )}

        {domainError && (
          <div style={{ padding: '12px', backgroundColor: '#fce8e6', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Text>{domainError}</Text>
          </div>
        )}

        {feedbackMessage && (
          <div style={{ padding: '12px', backgroundColor: '#e1f5e1', borderRadius: '4px' }}>
            <Text>{feedbackMessage}</Text>
          </div>
        )}
      </BlockStack>
    </div>
  );
}
