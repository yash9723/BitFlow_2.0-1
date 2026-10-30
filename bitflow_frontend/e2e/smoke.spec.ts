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
  if (register) {
    // DPDP: month/year of birth (an adult) and the notice (components/ConsentFields.tsx)
    await page.getByLabel("Birth month").selectOption("1");
    await page.getByLabel("Birth year").selectOption("2000");
    await page.getByLabel(/I have read the privacy notice/).check();
    await page.waitForTimeout(3_500);   // the sign-up form's minimum time (lib/bot-check.ts)
  }
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

test("Academy: a chapter's circuit runs on the page", async ({ page }) => {
  await quiet(page);
  await signIn(page, false);
  await page.goto("/academy/what-is-digital");
  await expect(page.getByRole("heading", { name: "What Is Digital?" })).toBeVisible();
  const circuit = page.getByRole("group", { name: "Circuit series_parallel" });
  await expect(circuit.locator('path[stroke="#00e87a"]')).toHaveCount(0);
  await circuit.locator('[data-knob="a"]').click();
  await expect(circuit.locator('path[stroke="#00e87a"]')).not.toHaveCount(0);
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

test("Board Lab: a lesson is checked in the browser", async ({ page }) => {
  test.slow();   // the first check downloads Yosys (~6 MB)
  await quiet(page);
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: /Build real hardware/ })).toBeVisible();
  await page.goto("/lab/light-an-led");
  await page.getByRole("button", { name: "Check my design" }).click();
  await expect(page.getByText("LED 0 is off: led[0] should be 1.")).toBeVisible({ timeout: 120_000 });
  // Typing into Monaco fights its auto-closing brackets, so set the text as an edit.
  await page.waitForFunction(() => (window as any).monaco?.editor.getEditors().length > 0);
  await page.evaluate(() => {
    const ed = (window as any).monaco.editor.getEditors()[0];
    ed.executeEdits("e2e", [{ range: ed.getModel().getFullModelRange(), text: "module lab (output [5:0] led);\n  assign led = 6'b000001;\nendmodule\n" }]);
  });
  await page.getByRole("button", { name: "Check my design" }).click();
  await expect(page.getByLabel("passed")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByText("✓ lesson complete")).toBeVisible();
  // A real board, from its KiCad design: the model loads and is credited.
  await page.getByRole("radio", { name: "ULX3S" }).click();
  await expect(page.getByText(/3D model: ULX3S by EMARD and Radiona/)).toBeVisible();
  await expect(page.getByText("Loading the ULX3S…")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(/Couldn't load the ULX3S/)).toHaveCount(0);
});
