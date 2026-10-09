import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import process from "node:process";

export function adminCredentials() {
  if (process.env.RESQ_TEST_ADMIN_EMAIL && process.env.RESQ_TEST_ADMIN_PASSWORD)
    return {
      email: process.env.RESQ_TEST_ADMIN_EMAIL,
      password: process.env.RESQ_TEST_ADMIN_PASSWORD,
    };
  const saved = readFileSync(
    new URL("../../runtime/admin-credentials.txt", import.meta.url),
    "utf8",
  );
  return {
    email: saved.match(/^Email: (.+)$/m)![1].trim(),
    password: saved.match(/^Password: (.+)$/m)![1].trim(),
  };
}

export const test = base.extend<{ signedIn: void }>({
  signedIn: [
    async ({ request, context }, use) => {
      const response = await request.post(
        "http://127.0.0.1:8000/api/auth/login",
        { data: adminCredentials() },
      );
      expect(response.ok()).toBeTruthy();
      await context.addCookies((await request.storageState()).cookies);
      await use();
    },
    { auto: true },
  ],
});
