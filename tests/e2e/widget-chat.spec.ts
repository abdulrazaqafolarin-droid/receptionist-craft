import { expect, test, type Page } from "@playwright/test";

const RECEPTIONIST_ID = "11111111-1111-4111-8111-111111111111";

async function mockWidgetBackend(page: Page) {
  const submittedMessages: string[] = [];
  let directOrderRpcCalls = 0;

  await page.route("**/rest/v1/rpc/get_public_receptionist*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: RECEPTIONIST_ID,
        name: "Demo Receptionist",
        business_name: "Acme Demo",
        greeting_message: "Welcome to Acme Demo! How can I help you today?",
        active: true,
        timezone: "Africa/Lagos",
        tone: "friendly",
        business_model: "services",
        widget_surface: { booking: true, ordering: true, voice: false, lead_capture: true },
        business_info: null,
      }]),
    });
  });

  await page.route("**/rest/v1/rpc/get_services_for_receptionist*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/rest/v1/rpc/create_widget_order*", async (route) => {
    directOrderRpcCalls += 1;
    await route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"direct client RPC forbidden"}' });
  });

  await page.route("**/rest/v1/chat_messages*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else {
      await route.fulfill({ status: 201, body: "" });
    }
  });

  await page.route("**/functions/v1/widget-chat*", async (route) => {
    let body: Record<string, unknown> = {};
    try {
      body = route.request().postDataJSON() as Record<string, unknown>;
    } catch {
      // The mocked endpoint returns a bounded response for malformed test input too.
    }
    const message = typeof body.message === "string" ? body.message : "";
    if (message.trim()) submittedMessages.push(message);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: message.trim()
          ? "I can help with an appointment. What service would you like?"
          : "",
      }),
    });
  });

  return {
    submittedMessages,
    directOrderRpcCalls: () => directOrderRpcCalls,
  };
}

test.describe("Rutex public receptionist smoke tests", () => {
  test("invalid widget links fail clearly without calling the backend", async ({ page }) => {
    await page.goto("/widget");
    await expect(page.getByRole("heading", { name: "Invalid Widget Link" })).toBeVisible();
    await expect(page.getByText("This chat widget link is not properly configured.")).toBeVisible();
  });

  test("loads a receptionist greeting and sends messages through widget-chat", async ({ page }) => {
    const mock = await mockWidgetBackend(page);
    await page.goto(`/widget?rid=${RECEPTIONIST_ID}`);

    await expect(page.getByRole("heading", { name: "Demo Receptionist" })).toBeVisible();
    await expect(page.getByText("Acme Demo", { exact: true })).toBeVisible();
    await expect(page.getByText("Welcome to Acme Demo! How can I help you today?")).toBeVisible();

    const input = page.getByPlaceholder("Type your message...");
    await expect(input).toBeVisible();
    await input.fill("I want to book an appointment");
    await input.press("Enter");

    await expect(page.getByText("I can help with an appointment. What service would you like?")).toBeVisible();
    await expect.poll(() => mock.submittedMessages).toContain("I want to book an appointment");
    expect(mock.directOrderRpcCalls()).toBe(0);
  });

  test("keeps the public widget usable at a narrow mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockWidgetBackend(page);
    await page.goto(`/widget?rid=${RECEPTIONIST_ID}`);

    await expect(page.getByRole("heading", { name: "Demo Receptionist" })).toBeVisible();
    await expect(page.getByPlaceholder("Type your message...")).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  test("protects owner-only surfaces when no authenticated session exists", async ({ page }) => {
    for (const path of ["/dashboard", "/appointments", "/workers", "/director"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth(?:\?.*)?$/);
      await expect(page.getByRole("heading", { name: "Welcome to Rutex Frontdesk" })).toBeVisible();
    }
  });
});
