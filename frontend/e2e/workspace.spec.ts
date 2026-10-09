import { expect } from "@playwright/test";
import { test } from "./auth";

test("review submitted fixtures, approve a duplicate, reload, and navigate admin workspaces", async ({
  page,
  request,
}) => {
  const before = await (
    await request.get("http://127.0.0.1:8000/api/analytics/summary")
  ).json();
  const existing: { latitude: number | null; longitude: number | null }[] =
    await (await request.get("http://127.0.0.1:8000/api/incidents")).json();
  let latitude = 0;
  while (
    existing.some(
      (i) =>
        i.latitude !== null &&
        i.longitude !== null &&
        Math.abs(i.latitude - latitude) < 0.15 &&
        Math.abs(i.longitude) < 0.15,
    )
  )
    latitude += 0.2;
  const locationName = `Test Observatory ${Date.now()}`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Local workspace connected")).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/command-center.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: /Submit report/i }),
  ).toHaveCount(0);
  const session = await (
    await request.get("http://127.0.0.1:8000/api/auth/session")
  ).json();
  for (let n = 0; n < 2; n++) {
    const response = await request.post("http://127.0.0.1:8000/api/reports", {
      headers: { "X-CSRF-Token": session.csrf },
      timeout: 100000,
      data: {
        text: "Synthetic test: Flooding at Test Observatory. 2 people trapped. Rescue requested.",
        location_text: locationName,
        latitude,
        longitude: 0,
        occurred_at: "2026-10-08T09:00:00+05:30",
        synthetic: true,
      },
    });
    expect(response.status()).toBe(201);
    const report = await response.json();
    await page.reload();
    await page
      .getByRole("button", {
        name: `Open report ${report.id.slice(0, 8).toUpperCase()}`,
      })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 100000 });
    await expect(
      page.getByRole("dialog").getByText("Reported", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close incident" }).click();
  }
  await page.getByRole("button", { name: /Review Queue/ }).click();
  const match = page
    .locator(".match-card")
    .filter({ hasText: locationName })
    .first();
  await expect(match).toBeVisible();
  await match
    .getByRole("textbox")
    .fill("Browser rehearsal: same source location and observed time");
  await match.getByRole("button", { name: /Approve & link/ }).click();
  await expect(match).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Local workspace connected")).toBeVisible();
  const after = await (
    await request.get("http://127.0.0.1:8000/api/analytics/summary")
  ).json();
  expect(after.total_reports).toBe(before.total_reports + 2);
  expect(after.unique_incidents).toBe(before.unique_incidents + 1);
  for (const name of [
    "Incident Map",
    "Incident Intelligence",
    "Nearby Help",
    "Analytics",
    "System Status",
    "About / Open Source",
    "Command Center",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  }
  expect(errors).toEqual([]);
});

test("mobile layout fits the viewport and exposes navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Local workspace connected")).toBeAttached();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "../docs/screenshots/mobile-command.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("button", { name: "Incident Intelligence", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Incident Intelligence",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
