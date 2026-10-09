import { expect } from "@playwright/test";
import { test } from "./auth";

test("location-assisted car theft report finds real mapped police and prepares an unsent alert", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 22.7229,
    longitude: 88.4806,
    accuracy: 15,
  });
  const registration = await context.request.post(
    "http://127.0.0.1:8000/api/auth/register",
    {
      data: {
        email: `nearby-browser-${Date.now()}@test.local`,
        name: "Browser Reporter",
        password: "Browser private report 2026",
      },
    },
  );
  expect(registration.status()).toBe(201);
  await page.goto("/#my-reports");
  await page
    .getByRole("button", { name: "Report an incident", exact: true })
    .first()
    .click();
  await page
    .getByLabel(/What is being reported/)
    .fill(
      "Synthetic demonstration: my car was stolen near Barasat railway station.",
    );
  await page.getByRole("button", { name: "Use my live location" }).click();
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue(
    "22.722900",
  );
  await expect(page.getByText(/±15 m/)).toBeVisible();
  await page.getByRole("button", { name: "Stop live location" }).click();
  await page
    .getByLabel("Location name")
    .fill("Barasat / browser geolocation fixture");
  await page
    .getByRole("checkbox", { name: /Find the nearest suitable service/ })
    .check();
  await page.getByRole("checkbox", { name: /synthetic demonstration/ }).check();
  await page.getByRole("button", { name: "Process report" }).click();
  const dialog = page.locator(".user-content");
  await expect(dialog).toBeVisible({ timeout: 100000 });
  await expect(dialog.getByText("Prepared only. No alert sent.")).toBeVisible({
    timeout: 45000,
  });
  await expect(
    dialog.getByText(
      "Synthetic reports cannot be sent to external responders.",
    ),
  ).toBeVisible();
  await expect(dialog.locator(".facility-row").first()).toContainText(
    "straight-line distance",
  );
  await expect(
    dialog.getByRole("button", { name: "Send alert to connected gateway" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "../docs/screenshots/nearby-police.png",
    fullPage: true,
  });
});

test("nearby help remains usable with manual coordinates after location denial", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition: (
          _: unknown,
          failure: (error: { code: number }) => void,
        ) => {
          setTimeout(() => failure({ code: 1 }), 0);
          return 1;
        },
        clearWatch: () => {},
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#nearby");
  await page.getByRole("button", { name: "Use my live location" }).click();
  await expect(page.getByRole("alert")).toContainText("permission was denied");
  await page.getByLabel("Incident latitude", { exact: true }).fill("22.7229");
  await page.getByLabel("Incident longitude", { exact: true }).fill("88.4806");
  await page.getByLabel("Service needed").selectOption("police");
  await page.getByRole("button", { name: "Find nearest service" }).click();
  await expect(page.locator(".facility-row").first()).toBeVisible({
    timeout: 45000,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
