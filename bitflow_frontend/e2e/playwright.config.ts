/**
 * e2e/playwright.config.ts — end-to-end smoke tests against a running BitFlow (E2E_BASE_URL,
 * default the local stack on :3100). CI starts the API container and the built site first
 * (.github/workflows/ci.yml, job "e2e"). Locally: npm ci && npx playwright install chromium &&
 * npx playwright test (E2E_CHANNEL=chrome uses the installed Chrome instead).
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    viewport: { width: 1366, height: 860 },
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  },
});
