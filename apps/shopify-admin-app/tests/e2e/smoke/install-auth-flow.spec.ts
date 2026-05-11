import { expect, test } from "../fixtures";

test.describe("Install auth recovery @smoke", () => {
  test("fresh install bootstrap query forwards from root to /app", async ({ request }) => {
    const response = await request.get(
      "/?shop=quickstart-c8cc9986.myshopify.com&host=test-host&embedded=1",
      { maxRedirects: 0 },
    );

    expect([301, 302, 303, 307, 308]).toContain(response.status());
    const location = response.headers()["location"];
    expect(location).toContain("/app?");
    expect(location).toContain("shop=quickstart-c8cc9986.myshopify.com");
    expect(location).toContain("host=test-host");
    expect(location).toContain("embedded=1");
  });

  test("initial app landing route responds without 5xx", async ({ request }) => {
    const response = await request.get(
      "/app?shop=quickstart-c8cc9986.myshopify.com&host=test-host&embedded=1",
      { maxRedirects: 0 },
    );
    expect(response.status()).toBeLessThan(500);
  });

  test("reinstall-required onboarding route responds without 5xx", async ({ request }) => {
    const response = await request.get(
      "/app/onboarding?shop=quickstart-c8cc9986.myshopify.com&host=test-host&embedded=1&step=1",
      { maxRedirects: 0 },
    );
    expect(response.status()).toBeLessThan(500);
  });
});
