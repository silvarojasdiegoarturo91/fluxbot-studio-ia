import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query {
      shop {
        name
      }
    }`
  );
  
  const responseJson = await response.json();
  const shopName = responseJson.data?.shop?.name || "";
  
  const firstName = session.firstName || "";
  const lastName = session.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();

  return { shopName, fullName, email: session.email || "" };
};

export default function Index() {
  const { shopName, fullName, email } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <s-stack direction="block" gap="base">
        <div style={{ marginBottom: "16px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: "0 0 4px 0" }}>
            Hi {fullName || shopName}👋
          </h1>
          <p style={{ color: "#616161", margin: 0 }}>Bienvenido a Chatty</p>
        </div>

        {/* Sección de activación */}
        <s-box 
          padding="base" 
          background="subdued" 
          borderRadius="base" 
          borderWidth="base"
        >
          <s-stack direction="block" gap="tight">
            <s-heading>Activar cuenta para la aplicación web</s-heading>
            <s-paragraph>
              Activa tu cuenta para iniciar sesión y administrar conversaciones en la aplicación web.
            </s-paragraph>
            <div style={{ marginTop: "8px" }}>
              <s-button variant="primary">Activar cuenta</s-button>
            </div>
          </s-stack>
        </s-box>

        {/* Sección de Resumen */}
        <s-section heading="Resumen">
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#616161"
          }}>
            <span>Comparar con: 27 Feb - 01 Mar 2026</span>
            <span>Actualizado hace 8 min</span>
          </div>

          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
            gap: "16px" 
          }}>
            <MetricCard title="Conversaciones totales" value="0" />
            <MetricCard title="Tasa de resolución" value="0%" />
            <MetricCard title="Ingresos asistidos" value="$0" />
            <MetricCard title="Tasa de chat a ventas" value="0%" />
            <MetricCard title="Participación total de ventas aportada por Chatty" value="0%" />
          </div>
        </s-section>

        {/* Sección de Inicio Rápido */}
        <s-box padding="base" borderWidth="base" borderRadius="base" background="default">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" align="center" gap="tight" justify="space-between">
              <s-heading>Inicio rápido</s-heading>
              <s-text fontWeight="bold">0 de 5 tareas completadas</s-text>
            </s-stack>
            
            <s-paragraph>
              Utilice esta guía para comenzar a configurar la aplicación en su tienda
            </s-paragraph>

            {/* Siguiente paso destacado */}
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-text color="subdued" style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: "bold" }}>Siguiente paso:</s-text>
                <s-stack direction="inline" gap="tight" align="center">
                  <span style={{ 
                    backgroundColor: "#DFE3E8", 
                    padding: "2px 8px", 
                    borderRadius: "4px", 
                    fontSize: "12px",
                    fontWeight: "500"
                  }}>
                    Entrenar IA
                  </span>
                  <s-heading>Configurar asistente de IA</s-heading>
                </s-stack>
                <s-paragraph>
                  Enseña a la IA sobre tu negocio para que pueda responder con precisión las preguntas de los clientes 
                </s-paragraph>
                <div style={{ marginTop: "8px" }}>
                  <s-button variant="primary">Configurar asistente</s-button>
                </div>
              </s-stack>
            </s-box>

            {/* Otros pasos */}
            <s-stack direction="block" gap="tight">
              <div style={{ borderTop: "1px solid #E1E3E5", paddingTop: "12px" }}>
                <s-button variant="tertiary" style={{ width: "100%", justifyContent: "flex-start", textAlign: "left" }}>
                  Configurar chat en vivo
                </s-button>
              </div>
            </s-stack>
          </s-stack>
        </s-box>

        {/* Sección Suggest Features */}
        <s-box padding="base" borderWidth="base" borderRadius="base" background="default">
          <s-stack direction="block" gap="base">
            <s-heading>Suggest Features</s-heading>
            <s-paragraph>Share your feature ideas</s-paragraph>

            <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Honeypot field (hidden) */}
              <div style={{ display: 'none' }}>
                <label>If you are a human, ignore this field</label>
                <input type="text" name="honeypot" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '14px', fontWeight: '500' }}>repeat your email address (required)</label>
                <input 
                  type="email" 
                  placeholder="name@domain.com"
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '14px', fontWeight: '500' }}>Title</label>
                <input 
                  placeholder="Name your feature"
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '14px', fontWeight: '500' }}>Description</label>
                <textarea 
                  rows={4}
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '500' }}>Name</label>
                  <input 
                    defaultValue={fullName}
                    placeholder="Your name"
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '500' }}>Email</label>
                  <input 
                    type="email"
                    defaultValue={email}
                    placeholder="Your email address"
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <input type="checkbox" id="agree" style={{ marginTop: '4px' }} />
                <label htmlFor="agree" style={{ fontSize: '13px', color: '#616161' }}>
                  I agree with and<br />
                  <span style={{ fontSize: '12px' }}>
                    Optional. If you provide your email address, we will notify you when your feedback receives comments or updates.
                  </span>
                </label>
              </div>

              <div style={{ marginTop: '8px' }}>
                <s-button variant="primary">Add idea</s-button>
              </div>
            </form>
          </s-stack>
        </s-box>
      </s-stack>
    </s-page>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <s-box 
      padding="base" 
      borderWidth="base" 
      borderRadius="base" 
      background="default"
      style={{ height: "100%" }}
    >
      <s-stack direction="block" gap="tight">
        <s-text color="subdued" style={{ fontSize: "14px" }}>{title}</s-text>
        <s-text fontWeight="bold" style={{ fontSize: "20px" }}>{value}</s-text>
      </s-stack>
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
