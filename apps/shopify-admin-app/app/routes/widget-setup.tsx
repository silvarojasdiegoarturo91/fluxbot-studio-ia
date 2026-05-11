'use client';

import { useState, useEffect } from 'react';
import { Tabs, Card, BlockStack, Text, Badge, SkeletonBodyText } from '@shopify/polaris';
import { WidgetTokenManager } from '../components/widget-token-manager';
import { DomainManager } from '../components/domain-manager';

interface Conversation {
  id: string;
  domain: string;
  sessionId: string;
  createdAt: string;
}

interface Stats {
  totalMessages: number;
  domainCount: number;
  errorRate: number;
  activeTokens: number;
  allowedDomainsCount: number;
  plan?: string;
}

export default function WidgetSetupPage() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const tenantId = 'demo-tenant'; // In real app, get from auth

  useEffect(() => {
    fetchConversations();
    fetchStats();
  }, []);

  const fetchConversations = async () => {
    try {
      const response = await fetch(`/api/v1/widget-admin/conversation/recent?tenantId=${tenantId}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/v1/widget-admin/stats?tenantId=${tenantId}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const tabs = [
    {
      id: 'tokens',
      content: 'Tokens',
    },
    {
      id: 'domains',
      content: 'Dominios',
    },
    {
      id: 'conversations',
      content: 'Conversaciones',
    },
    {
      id: 'stats',
      content: 'Estadísticas',
    },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <BlockStack gap="500" vertical>
        <div>
          <Text variant="headingLg">Configuración del Widget</Text>
          <Text variant="bodyMd" color="subdued">
            Gestiona tokens, dominios y monitorea el uso de tu widget
          </Text>
        </div>

        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
          {/* TOKENS TAB */}
          {selectedTab === 0 && (
            <div style={{ paddingTop: '20px' }}>
              <WidgetTokenManager tenantId={tenantId} />
            </div>
          )}

          {/* DOMAINS TAB */}
          {selectedTab === 1 && (
            <div style={{ paddingTop: '20px' }}>
              <DomainManager tenantId={tenantId} />
            </div>
          )}

          {/* CONVERSATIONS TAB */}
          {selectedTab === 2 && (
            <div style={{ paddingTop: '20px' }}>
              <BlockStack gap="400" vertical>
                <Text variant="headingMd">Conversaciones Recientes</Text>

                {loading ? (
                  <SkeletonBodyText />
                ) : conversations.length === 0 ? (
                  <Card>
                    <Text color="subdued">No hay conversaciones aún.</Text>
                  </Card>
                ) : (
                  <BlockStack gap="200" vertical>
                    {conversations.map((conv) => (
                      <Card key={conv.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div>
                            <Text variant="bodyMd" fontWeight="bold">
                              {conv.domain}
                            </Text>
                            <Text variant="bodySm" color="subdued">
                              Sesión: {conv.sessionId.substring(0, 8)}...
                            </Text>
                            <Text variant="bodySm" color="subdued">
                              {formatDate(conv.createdAt)}
                            </Text>
                          </div>
                          <Badge>{conv.id.substring(0, 8)}</Badge>
                        </div>
                      </Card>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </div>
          )}

          {/* STATS TAB */}
          {selectedTab === 3 && (
            <div style={{ paddingTop: '20px' }}>
              <BlockStack gap="400" vertical>
                <Text variant="headingMd">Estadísticas</Text>

                {loading || !stats ? (
                  <SkeletonBodyText />
                ) : (
                  <BlockStack gap="300" vertical>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                      <Card>
                        <BlockStack gap="200" vertical>
                          <Text variant="bodySm" color="subdued">
                            Mensajes Totales
                          </Text>
                          <Text variant="heading2xl" fontWeight="bold">
                            {stats.totalMessages.toLocaleString()}
                          </Text>
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="200" vertical>
                          <Text variant="bodySm" color="subdued">
                            Dominios
                          </Text>
                          <Text variant="heading2xl" fontWeight="bold">
                            {stats.domainCount}
                          </Text>
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="200" vertical>
                          <Text variant="bodySm" color="subdued">
                            Tasa de Error
                          </Text>
                          <Text variant="heading2xl" fontWeight="bold" color={stats.errorRate > 0.05 ? 'critical' : 'success'}>
                            {(stats.errorRate * 100).toFixed(2)}%
                          </Text>
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="200" vertical>
                          <Text variant="bodySm" color="subdued">
                            Tokens Activos
                          </Text>
                          <Text variant="heading2xl" fontWeight="bold">
                            {stats.activeTokens}
                          </Text>
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="200" vertical>
                          <Text variant="bodySm" color="subdued">
                            Dominios Permitidos
                          </Text>
                          <Text variant="heading2xl" fontWeight="bold">
                            {stats.allowedDomainsCount}
                          </Text>
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="200" vertical>
                          <Text variant="bodySm" color="subdued">
                            Plan
                          </Text>
                          <Text variant="heading2xl" fontWeight="bold">
                            {stats.plan || 'Free'}
                          </Text>
                        </BlockStack>
                      </Card>
                    </div>

                    <Card>
                      <BlockStack gap="200" vertical>
                        <Text variant="headingMd">Límites de Tasa</Text>
                        <Text variant="bodySm" color="subdued">
                          10 mensajes por minuto • 1000 mensajes por día
                        </Text>
                      </BlockStack>
                    </Card>
                  </BlockStack>
                )}
              </BlockStack>
            </div>
          )}
        </Tabs>
      </BlockStack>
    </div>
  );
}
