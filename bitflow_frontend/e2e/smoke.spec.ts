/**
 * e2e/smoke.spec.ts — the paths people use most, through the real UI: public pages, signing up,
 * simulating in the Sandbox, saving a project, running and submitting a problem, and building
 * a bitstream in the browser. Each run signs up a fresh throwaway account.
 */
import { expect, test, type Page } from "@playwright/test";
import crypto from "node:crypto";

const username = `e2e${crypto.randomBytes(4).toString("hex")}`;
const password = `Pw!${crypto.randomBytes(9).toString("hex")}`;

/** No analytics banner in the way. */
async function quiet(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem("bitflow_analytics_consent", "denied"); } catch { /* none */ } });
}

async function signIn(page: Page, register: boolean) {
  await page.goto("/login?next=/sandbox", { waitUntil: "networkidle" });
  if (register) {
    await page.getByText("Need a new account? Register here").click();
    await expect(page.getByText("Already registered? Sign in here")).toBeVisible();
  }
  await page.getByPlaceholder("e.g. system_operator").fill(username);
  await page.getByPlaceholder("••••••••").first().fill(password);
  if (register) await page.waitForTimeout(3_500);   // the sign-up form's minimum time (lib/bot-check.ts)
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => /^\/(sandbox|dashboard)/.test(url.pathname), { timeout: 30_000 });   // not /login?next=/sandbox
}

test.describe.configure({ mode: "serial" });

test("public pages load", async ({ page }) => {
  await quiet(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/BitFlow/);
  await page.goto("/flash");
  await expect(page.getByRole("heading", { name: "Flash an FPGA board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Serial monitor" })).toBeVisible();
  const studio = await page.goto("/studio");
  expect(studio?.status()).toBe(200);
});

test("sign up, simulate in the Sandbox and save a project", async ({ page }) => {
  await quiet(page);
  await signIn(page, true);
  await page.goto("/sandbox");
  await page.getByRole("button", { name: /^Run/ }).first().click();
  await expect(page.getByText(/Simulation finished|TESTS PASSED|PASS/).first()).toBeVisible({ timeout: 90_000 });

  page.once("dialog", (d) => d.accept("e2e project"));
  await page.getByRole("button", { name: /Not saved/ }).click();
  await page.getByRole("menuitem", { name: /Save as a project/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /e2e project/ })).toBeVisible();
});

test("run and submit a problem", async ({ page }) => {
  await quiet(page);
  await signIn(page, false);
  await page.goto("/problems/the-first-wire");
  await page.getByRole("button", { name: /^Run/ }).first().click();
  await expect(page.getByText(/Simulation finished|Compil|PASS|FAIL/).first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: /^Submit/ }).first().click();
  await expect(page.getByText(/Accepted|Wrong answer|not accepted|failed|passed/i).first()).toBeVisible({ timeout: 90_000 });
});

test("build an iCE40 bitstream in the browser", async ({ page }) => {
  test.slow();   // the first build downloads Yosys and nextpnr (~11 MB)
  await quiet(page);
  await signIn(page, false);
  await page.goto("/sandbox");
  await page.getByTitle(/Synthesize with Yosys/).click();
  await page.getByRole("tab", { name: "Bitstream" }).click();
  await page.getByRole("button", { name: "Build bitstream" }).click();
  await expect(page.getByRole("button", { name: /Download .*\.bin/ })).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText("openFPGALoader -b ice40_generic")).toBeVisible();
});
