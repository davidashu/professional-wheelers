import { expect, test } from "@playwright/test";
import pg from "pg";

const DB = process.env.DATABASE_URL ?? "postgres://postgres@localhost:54329/crm_e2e";
const SALES = { email: "jordan@demo.autotransport.test", password: "DemoPassw0rd!" };
const TOM = "c0000000-0000-4000-8000-000000000004";

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    await c.end();
  }
}

test("home page has customer and broker portal entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("customer-portal-entry")).toContainText("Customer portal");
  await expect(page.getByTestId("broker-portal-entry")).toContainText("Broker portal");
  await page.getByTestId("customer-portal-entry").click();
  await expect(page).toHaveURL(/\/portal\/login/);
  await page.goto("/");
  await page.getByTestId("broker-portal-entry").click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Broker portal").first()).toBeVisible();
});

test("portal pages require a session; email sign-in explains when email isn't set up", async ({ page }) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal\/login/);
  await page.goto("/portal/messages");
  await expect(page).toHaveURL(/\/portal\/login/);
  await page.fill("#email", "tbecker@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/Email sign-in isn't available yet/)).toBeVisible();
  await page.goto("/portal/auth?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await page.getByRole("button", { name: "Continue to my portal" }).click();
  await expect(page.getByText(/isn't valid/)).toBeVisible();
});

test("staff copy a portal link; the customer sees only their own shipments", async ({ page, browser }) => {
  await page.goto("/login");
  await page.fill("#email", SALES.email);
  await page.fill("#password", SALES.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
  await page.goto(`/customers/${TOM}`);
  await page.getByRole("button", { name: "Get a portal sign-in link for this customer" }).click();
  const link = await page.getByTestId("portal-link").inputValue();
  expect(link).toMatch(/\/portal\/auth\?token=[A-Za-z0-9_-]{43}$/);

  const mine = await query<{ reference: string }>("select reference from leads where customer_id = $1", [TOM]);
  const others = await query<{ reference: string }>("select reference from leads where customer_id <> $1", [TOM]);
  const internal = await query<{ carrier_pay: string; broker_fee: string }>(
    "select q.carrier_pay, q.broker_fee from quotes q join leads l on l.id = q.lead_id where l.customer_id = $1",
    [TOM],
  );

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cust = await ctx.newPage();
  await cust.goto(new URL(link).pathname + new URL(link).search);
  await cust.getByRole("button", { name: "Continue to my portal" }).click();
  await cust.waitForURL("**/portal");
  await expect(cust.getByRole("heading", { name: "Hi Tom" })).toBeVisible();
  const html = await cust.content();
  for (const m of mine) expect(html).toContain(m.reference);
  for (const o of others) expect(html).not.toContain(o.reference);
  for (const q of internal) {
    for (const v of [q.carrier_pay, q.broker_fee]) {
      if (Number(v) > 0) expect(html).not.toContain("$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 }));
    }
  }
  expect(html).not.toMatch(/carrier_pay|broker_fee|link_id|token_hash|internal_note|lost_reason/);
  // Staff links can be reused on a second device
  const ctx2 = await browser.newContext();
  const second = await ctx2.newPage();
  await second.goto(new URL(link).pathname + new URL(link).search);
  await second.getByRole("button", { name: "Continue to my portal" }).click();
  await second.waitForURL("**/portal");
  await ctx2.close();
  await ctx.close();
});
