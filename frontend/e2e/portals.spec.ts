import { test, expect } from "@playwright/test";
import { adminCredentials } from "./auth";

test("private user report reaches admin, urgent case is reviewed, conversation persists", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = `browser-${Date.now()}@test.local`;
  await page.goto("/#user");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/portal-sign-in.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByLabel("Your name").fill("Browser Reporter");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser private report 2026");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "My reports" })).toBeVisible();
  await expect(
    page.getByText("No reports yet.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Report an incident", exact: true })
    .first()
    .click();
  const source = `Synthetic portal rehearsal ${Date.now()}: car stolen; someone is in immediate danger.`;
  await page.getByLabel(/What is being reported/).fill(source);
  await page
    .getByLabel("Incident category", { exact: true })
    .selectOption("crime");
  await page
    .getByRole("checkbox", { name: /Someone is in immediate danger/ })
    .check();
  await page.getByRole("checkbox", { name: /synthetic demonstration/ }).check();
  await page
    .getByLabel("Location name")
    .fill("Fictional portal rehearsal site");
  await page.getByRole("button", { name: "Process report" }).click();
  await expect(page.locator(".case-original")).toHaveText(source, {
    timeout: 100000,
  });
  await expect(page.locator(".case-detail-heading .urgency")).toHaveText(
    "critical",
  );
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto("http://127.0.0.1:5173/#admin");
  await admin.getByLabel("Email address").fill(adminCredentials().email);
  await admin
    .getByLabel("Password", { exact: true })
    .fill(adminCredentials().password);
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "Emergency Cases." }),
  ).toBeVisible();
  await admin.getByLabel("Search cases").fill(source);
  await admin.locator(".case-row").filter({ hasText: source }).click();
  await admin
    .getByLabel("Case status", { exact: true })
    .selectOption("in_progress");
  await admin
    .getByLabel("Assign administrator")
    .selectOption({ label: "RESQ Administrator" });
  await admin
    .getByLabel("Update for the reporter")
    .fill(
      "Admin rehearsal: reviewing the theft report. Please confirm the vehicle colour.",
    );
  await admin.getByRole("button", { name: "Save case update" }).click();
  await expect(
    admin.getByText("Update saved and shared with the reporter."),
  ).toBeVisible();
  await admin.screenshot({
    path: "../docs/screenshots/admin-cases.png",
    fullPage: true,
  });
  await expect(page.locator(".case-message.admin")).toContainText(
    "Please confirm the vehicle colour.",
    { timeout: 20000 },
  );
  await expect(page.locator(".case-facts")).toContainText("in progress");
  await page
    .getByLabel("Case message")
    .fill("Reporter rehearsal: the vehicle is silver.");
  await page.getByRole("button", { name: "Send case message" }).click();
  await expect(admin.locator(".case-message.user")).toContainText(
    "the vehicle is silver",
    { timeout: 20000 },
  );
  await page.screenshot({
    path: "../docs/screenshots/user-cases.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser private report 2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator(".case-row").filter({ hasText: source }).click();
  await expect(page.locator(".case-message.admin")).toContainText(
    "vehicle colour",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "../docs/screenshots/user-portal-mobile.png",
    fullPage: true,
  });
  await admin
    .getByLabel("Case status", { exact: true })
    .selectOption("resolved");
  await admin
    .getByLabel("Update for the reporter")
    .fill(
      "Synthetic browser rehearsal completed. No real emergency or dispatch.",
    );
  await admin.getByRole("button", { name: "Save case update" }).click();
  await expect(page.locator(".case-facts")).toContainText("resolved", {
    timeout: 20000,
  });
  await adminContext.close();
  expect(errors).toEqual([]);
});

test("sign-in screen fits a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#user");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
