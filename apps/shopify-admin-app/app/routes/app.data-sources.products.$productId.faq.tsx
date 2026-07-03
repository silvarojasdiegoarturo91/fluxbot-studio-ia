import { useCallback, useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Modal,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useLocation, useSubmit } from "react-router";
import { authenticateAdminRequest } from "../utils/authenticate-admin.server";
import { ensureShopForSession } from "../services/shop-context.server";
import { getMerchantAdminConfig } from "../services/admin-config.server";
import {
  appendProductFaq,
  getManagedProductProjection,
  removeProductFaq,
} from "../services/product-faqs.server";
import { AdminPageHeader, AdminSectionCard } from "../components/admin-ui";

interface ProductFaqActionData {
  ok?: boolean;
  error?: string;
  message?: string;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const productProjectionId = String(params.productId || "").trim();
  if (!productProjectionId) {
    throw new Response("Product not found", { status: 404 });
  }

  const [adminConfig, product] = await Promise.all([
    getMerchantAdminConfig(shop.id),
    getManagedProductProjection({
      shopId: shop.id,
      productProjectionId,
    }),
  ]);

  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  return {
    product,
    isEs: adminConfig.adminLanguage === "es",
  };
}

export async function action({ request, params }: ActionFunctionArgs): Promise<ProductFaqActionData> {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }

  const { session } = await authenticateAdminRequest(request);
  const shop = await ensureShopForSession(session);

  if (!shop) {
    return { ok: false, error: "Shop not found" };
  }

  const adminConfig = await getMerchantAdminConfig(shop.id);
  const isEs = adminConfig.adminLanguage === "es";

  const productProjectionId = String(params.productId || "").trim();
  if (!productProjectionId) {
    return { ok: false, error: isEs ? "Producto no encontrado." : "Product not found." };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "").trim();

  if (intent === "add_faq") {
    const category = String(formData.get("category") || "").trim();
    const question = String(formData.get("question") || "").trim();
    const answer = String(formData.get("answer") || "").trim();

    if (!question || !answer) {
      return {
        ok: false,
        error: isEs ? "Pregunta y respuesta son obligatorias." : "Question and answer are required.",
      };
    }

    await appendProductFaq({
      shopId: shop.id,
      productProjectionId,
      category,
      question,
      answer,
    });

    return { ok: true, message: isEs ? "FAQ agregada." : "FAQ added." };
  }

  if (intent === "delete_faq") {
    const faqId = String(formData.get("faqId") || "").trim();
    if (!faqId) {
      return { ok: false, error: isEs ? "FAQ invalida." : "Invalid FAQ." };
    }

    await removeProductFaq({
      shopId: shop.id,
      productProjectionId,
      faqId,
    });

    return { ok: true, message: isEs ? "FAQ eliminada." : "FAQ deleted." };
  }

  return { ok: false, error: isEs ? "Acción no soportada." : "Unsupported action." };
}

export default function ProductFaqManagementPage() {
  const { product, isEs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const location = useLocation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const backUrl = `/app/data-sources${location.search || ""}`;

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setCategory("");
    setQuestion("");
    setAnswer("");
  }, []);

  const addFaq = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "add_faq");
    formData.append("category", category.trim());
    formData.append("question", question.trim());
    formData.append("answer", answer.trim());
    submit(formData, { method: "POST" });
    closeModal();
  }, [answer, category, closeModal, question, submit]);

  const deleteFaq = useCallback((faqId: string) => {
    const formData = new FormData();
    formData.append("intent", "delete_faq");
    formData.append("faqId", faqId);
    submit(formData, { method: "POST" });
  }, [submit]);

  const faqRows = useMemo(() => product.metadata.faqs, [product.metadata.faqs]);

  return (
    <Page fullWidth>
      <AdminPageHeader
        eyebrow={isEs ? "Grounding" : "Grounding"}
        title={isEs ? "Preguntas frecuentes sobre el producto" : "Product frequently asked questions"}
        description={isEs
          ? "Gestiona las FAQ que usará el agente para responder sobre este producto."
          : "Manage the FAQs that the agent will use to answer about this product."}
        backUrl={backUrl}
        backLabel={isEs ? "Fuentes de datos" : "Data sources"}
      />

      <Layout>
        {actionData?.ok && actionData.message ? (
          <Layout.Section>
            <Banner tone="success" title={actionData.message} />
          </Layout.Section>
        ) : null}
        {actionData?.ok === false && actionData.error ? (
          <Layout.Section>
            <Banner tone="critical" title={actionData.error} />
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">{product.title}</Text>
              <Text as="p" variant="bodySm">{isEs ? "Producto" : "Product"}: {product.productId}</Text>
              <Text as="p" variant="bodySm">Handle: {product.handle}</Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <AdminSectionCard
            title={isEs ? "Preguntas frecuentes sobre el producto" : "Product frequently asked questions"}
            description={isEs
              ? "Gestiona las preguntas frecuentes de tus productos."
              : "Manage frequently asked questions for your products."}
            badge={(
              <Button variant="tertiary" onClick={() => setIsModalOpen(true)}>
                {isEs ? "Agregar FAQ" : "Add FAQ"}
              </Button>
            )}
          >
            {faqRows.length === 0 ? (
              <EmptyState heading={isEs ? "No hay FAQs disponibles" : "No FAQs available"} image="">
                <Text as="p" variant="bodySm">
                  {isEs
                    ? "No hay Preguntas Frecuentes de Productos disponibles. Agrega FAQs para respuestas de IA más precisas."
                    : "No product FAQs are available. Add FAQs for more accurate AI responses."}
                </Text>
              </EmptyState>
            ) : (
              <BlockStack gap="300">
                {faqRows.map((faq) => (
                  <Card key={faq.id}>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm">
                        <strong>{isEs ? "Categoria" : "Category"}:</strong> {faq.category || "-"}
                      </Text>
                      <Text as="p" variant="headingSm">{faq.question}</Text>
                      <Text as="p" variant="bodyMd">{faq.answer}</Text>
                      <InlineStack align="end">
                        <Button variant="plain" tone="critical" onClick={() => deleteFaq(faq.id)}>
                          {isEs ? "Eliminar" : "Delete"}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            )}
          </AdminSectionCard>
        </Layout.Section>
      </Layout>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEs ? "Agregar preguntas frecuentes del producto" : "Add product frequently asked questions"}
        primaryAction={{
          content: isEs ? "Guardar" : "Save",
          onAction: addFaq,
          disabled: question.trim().length === 0 || answer.trim().length === 0,
        }}
        secondaryActions={[{ content: isEs ? "Cancelar" : "Cancel", onAction: closeModal }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodySm">
              {isEs
                ? "Gestiona las preguntas frecuentes de tus productos."
                : "Manage frequently asked questions for your products."}
            </Text>
            <Text as="p" variant="bodySm">
              <strong>{product.title}</strong>
            </Text>
            <TextField
              label={isEs ? "Categoria" : "Category"}
              value={category}
              onChange={setCategory}
              autoComplete="off"
              placeholder={isEs ? "ej. dimensiones, material, ensamblaje" : "e.g. dimensions, material, assembly"}
            />
            <TextField
              label={isEs ? "Pregunta" : "Question"}
              value={question}
              onChange={setQuestion}
              autoComplete="off"
            />
            <TextField
              label={isEs ? "Responder" : "Answer"}
              value={answer}
              onChange={setAnswer}
              autoComplete="off"
              multiline={5}
              maxLength={1000}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
