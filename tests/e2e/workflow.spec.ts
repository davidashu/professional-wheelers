import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

const DB = process.env.DATABASE_URL ?? "postgres://postgres@localhost:54329/crm_e2e";
const SALES = { email: "jordan@demo.autotransport.test", password: "DemoPassw0rd!" };
const CARRIER_PAY = "1234.56";
const BROKER_FEE = "321.09";
const INTERNAL_NOTE = "INTERNAL-ONLY lane note 7731";

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    await c.end();
  }
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill("#email", SALES.email);
  await page.fill("#password", SALES.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
}

/** Collect every response body the customer's browser receives. */
function recordResponses(page: Page) {
  const bodies: string[] = [];
  page.on("response", async (r) => {
    try {
      if (r.request().resourceType() === "document" || r.request().method() === "POST" || r.url().includes("_rsc")) {
        bodies.push(await r.text());
      }
    } catch {
      /* body not available (redirects) */
    }
  });
  return bodies;
}

function expectNoInternalPricing(text: string) {
  expect(text).not.toContain("1,234.56");
  expect(text).not.toContain("1234.56");
  expect(text).not.toContain("321.09");
  expect(text).not.toContain(INTERNAL_NOTE);
  expect(text).not.toMatch(/carrier_pay|broker_fee|gross profit|internal_note/i);
}

test.describe.serial("public request → quote → acceptance → booking", () => {
  let reference = "";
  let quoteLink = "";
  const email = `e2e-${Date.now()}@example.com`;

  test("customer submits a multi-vehicle quote request from a phone", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/get-a-quote");
    await expect(page.getByRole("heading", { name: "Get a Vehicle Shipping Quote" })).toBeVisible();

    // Server-side validation shows field errors (no client-side bypass needed)
    await page.waitForTimeout(3200);
    await page.getByRole("button", { name: "Request my quote" }).click();
    await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
    await expect(page.getByText("Name is required")).toBeVisible();

    await page.getByLabel("Full name").fill("Erin Test");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Phone").fill("555-201-3344");
    await page.locator('input[name="pickup_city"]').fill("Reno");
    await page.locator('select[name="pickup_state"]').selectOption("NV");
    await page.locator('input[name="pickup_zip"]').fill("89501");
    await page.locator('input[name="delivery_city"]').fill("Tampa");
    await page.locator('select[name="delivery_state"]').selectOption("FL");
    await page.locator('input[name="delivery_zip"]').fill("33602");
    const d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    await page.locator('input[name="earliest_pickup_date"]').fill(d);
    await page.locator('input[name="vehicles.0.year"]').fill("2021");
    await page.locator('input[name="vehicles.0.make"]').fill("Ford");
    await page.locator('input[name="vehicles.0.model"]').fill("Bronco");
    await page.getByRole("button", { name: "+ Add another vehicle" }).click();
    await page.locator('input[name="vehicles.1.year"]').fill("1969");
    await page.locator('input[name="vehicles.1.make"]').fill("Chevrolet");
    await page.locator('input[name="vehicles.1.model"]').fill("Camaro");
    await page.locator('input[name="vehicles.1.operable"][value="no"]').check();
    await page.locator('input[name="transport_type"][value="enclosed"]').check();
    await page.getByLabel(/Special instructions/).fill("Oversized tires on the Bronco; narrow driveway.");

    const submit = page.getByRole("button", { name: "Request my quote" });
    await submit.dblclick(); // double tap must not create two leads
    await expect(page.getByText("Request received")).toBeVisible();
    reference = (await page.getByTestId("reference").textContent())!.trim();
    expect(reference).toMatch(/^Q-[A-Z0-9]{6}$/);
    // No instant price anywhere on the confirmation
    await expect(page.locator("body")).not.toContainText("$");

    const leads = await query("select id from leads where contact_email = $1", [email]);
    expect(leads).toHaveLength(1);
    const vehicles = await query("select make from lead_vehicles where lead_id = $1 order by position", [leads[0]!.id]);
    expect(vehicles.map((v) => v.make)).toEqual(["Ford", "Chevrolet"]);
    await ctx.close();
  });

  test("staff find the lead, price it and get a customer link", async ({ page }) => {
    await signIn(page);
    await expect(page.getByText(reference)).toBeVisible(); // in "New requests"
    await page.goto(`/leads?q=${reference}`);
    await page.getByRole("link", { name: "Erin Test" }).click();
    await expect(page.getByRole("heading", { name: "Erin Test" })).toBeVisible();
    await expect(page.getByText("1969 Chevrolet Camaro")).toBeVisible();

    await page.fill("#carrier_pay", CARRIER_PAY);
    await page.fill("#broker_fee", BROKER_FEE);
    await expect(page.getByTestId("quote-total")).toHaveText("$1,555.65");
    await expect(page.getByTestId("gross-profit")).toContainText("$321.09");
    await page.fill("#internal_note", INTERNAL_NOTE);
    await page.getByRole("button", { name: /Send quote & get link/ }).click();
    await expect(page.getByText(/Quote v1 is live/)).toBeVisible();
    quoteLink = await page.getByTestId("quote-link").first().inputValue();
    expect(quoteLink).toMatch(/\/q\/[A-Za-z0-9_-]{43}$/);

    await page.reload();
    await expect(page.getByText("Awaiting reply")).toBeVisible();
    await expect(page.locator("header, h1").getByText("Quote Sent").or(page.getByText("Quote Sent").first())).toBeVisible();

    // The raw token is never stored
    const token = quoteLink.split("/q/")[1]!;
    const leaked = await query("select count(*)::int as n from quotes where token_hash = $1 or link_id::text = $1 or snapshot::text like '%' || $1 || '%'", [token]);
    expect(leaked[0]!.n).toBe(0);
  });

  test("customer sees only customer-safe details and accepts exactly once", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const page2 = await ctx.newPage();
    const bodies = recordResponses(page);
    const bodies2 = recordResponses(page2);
    const path = new URL(quoteLink).pathname;

    await page.goto(path);
    await page2.goto(path);
    await expect(page.getByTestId("public-total")).toHaveText("$1,555.65");
    await expect(page.getByText("2021 Ford Bronco")).toBeVisible();
    await expect(page.getByText("Enclosed carrier")).toBeVisible();
    await expect(page.getByTestId("terms")).not.toBeEmpty();
    expectNoInternalPricing(await page.content());

    // Accept in two tabs: one booking, second tab told it's already accepted
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Accept quote and book" }).dblclick();
    await expect(page.getByText(/Your shipment is booked/).first()).toBeVisible();
    const bookingRef = (await page.getByTestId("booking-reference").textContent())!.trim();
    expect(bookingRef).toMatch(/^B-/);

    await page2.getByRole("checkbox").check();
    await page2.getByRole("button", { name: "Accept quote and book" }).click();
    // The second tab's response is "already accepted"; the page then shows the same booking.
    await expect(page2.getByTestId("booking-reference")).toHaveText(bookingRef);

    const bookings = await query("select b.reference from bookings b join leads l on l.id = b.lead_id where l.reference = $1", [reference]);
    expect(bookings).toEqual([{ reference: bookingRef }]);
    const lead = await query("select status from leads where reference = $1", [reference]);
    expect(lead[0]!.status).toBe("booked");

    // Post-booking portal: addresses, contacts and signed agreement
    await expect(page.getByRole("heading", { name: "Complete your booking" })).toBeVisible();
    await expect(page.getByTestId("agreement-text")).toContainText("Replace this text");
    await page.getByLabel("Street address (with apt/suite)").first().fill("100 Main St Apt 4");
    await page.getByLabel("Contact name at pickup").fill("Erin Test");
    await page.locator('input[name="pickup_contact_phone"]').fill("555-201-3344");
    await page.getByLabel("Street address (with apt/suite)").nth(1).fill("55 Harbor Blvd");
    await page.getByLabel("Contact name at delivery").fill("Sam Test");
    await page.locator('input[name="delivery_contact_phone"]').fill("555-201-9988");
    await page.getByLabel("Type your full name to sign").fill("Erin Test");
    await page.getByLabel(/I agree to the booking agreement/).check();
    await page.getByRole("button", { name: "Sign and submit booking details" }).click();
    await expect(page.getByTestId("booking-details-summary")).toContainText("100 Main St Apt 4, Reno, NV 89501");
    await expect(page.getByTestId("booking-details-summary")).toContainText("Signed by Erin Test".replace("Signed by", "signed by"), { ignoreCase: true });

    await page.waitForTimeout(500);
    for (const b of [...bodies, ...bodies2]) expectNoInternalPricing(b);
    await ctx.close();
  });

  test("customer opens the portal from the quote link and chats with staff", async ({ browser }) => {
    const cctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const cust = await cctx.newPage();
    const bodies = recordResponses(cust);
    await cust.goto(new URL(quoteLink).pathname);
    await cust.getByRole("button", { name: "Open my customer portal" }).click();
    await cust.waitForURL("**/portal");
    await expect(cust.getByRole("heading", { name: "Hi Erin" })).toBeVisible();
    const card = cust.getByTestId(`shipment-${reference}`);
    await expect(card).toContainText("Reno, NV");
    await expect(card).toContainText("$1,555.65");
    await expect(card).toContainText("Booked · finding a carrier");
    await expect(card).toContainText("100 Main St Apt 4");

    await card.getByRole("link", { name: "Message us about this shipment" }).click();
    await expect(cust.getByRole("heading", { name: "Messages" })).toBeVisible();
    await expect(cust.locator("#reference")).toHaveValue(reference);
    await cust.fill("#body", "Can the driver call 30 minutes before pickup?");
    await cust.getByRole("button", { name: "Send message" }).click();
    await expect(cust.getByTestId("chat-message")).toContainText(["Can the driver call 30 minutes before pickup?"]);

    // Staff see it as unread, reply from the inbox
    const sctx = await browser.newContext();
    const staff = await sctx.newPage();
    await signIn(staff);
    await expect(staff.getByRole("link", { name: /Messages/ })).toContainText("1");
    await staff.goto("/messages");
    await expect(staff.getByTestId("inbox")).toContainText("Erin Test");
    await expect(staff.getByTestId("inbox")).toContainText("1 new");
    await staff.getByTestId("inbox").getByText("Erin Test").click();
    await expect(staff.getByTestId("chat-message").last()).toContainText("30 minutes before pickup");
    await staff.getByPlaceholder("Reply to the customer…").fill("Yes, we'll ask the carrier to call ahead.");
    await staff.getByRole("button", { name: "Send", exact: true }).click();
    await expect(staff.getByText(/Sent/).first()).toBeVisible();
    // The lead page shows the same conversation
    const [lead] = await query<{ id: string }>("select id from leads where reference = $1", [reference]);
    await staff.goto(`/leads/${lead!.id}`);
    await expect(staff.locator("#messages")).toContainText("call ahead");
    await sctx.close();

    await cust.reload();
    await expect(cust.getByTestId("chat-message").last()).toContainText("call ahead");
    await expect(cust.getByTestId("chat-message").last()).toContainText("Jordan");

    await cust.waitForTimeout(500);
    for (const b of bodies) expectNoInternalPricing(b);

    // Sign out ends the session
    await cust.getByRole("button", { name: "Sign out" }).click();
    await cust.waitForURL("**/portal/login?signed_out=1");
    await cust.goto("/portal");
    await expect(cust).toHaveURL(/\/portal\/login/);
    await cctx.close();
  });

  test("staff see the booking with signed agreement and full timeline", async ({ page }) => {
    await signIn(page);
    const [b] = await query<{ id: string }>("select b.id from bookings b join leads l on l.id = b.lead_id where l.reference = $1", [reference]);
    await page.goto(`/bookings/${b!.id}`);
    await expect(page.getByText("Agreement signed")).toBeVisible();
    await expect(page.locator("#b-pickup_address")).toHaveValue("100 Main St Apt 4, Reno, NV 89501");

    // Carrier is tracked separately from "Booked"
    await page.selectOption("#b-status", "carrier_assigned");
    await page.getByRole("button", { name: "Save booking" }).click();
    await expect(page.getByText("Enter the carrier name before moving past Awaiting Carrier.")).toBeVisible();
    await page.fill("#b-carrier_name", "Desert Line Haulers");
    await page.getByRole("button", { name: "Save booking" }).click();
    await expect(page.getByText("Booking saved.")).toBeVisible();

    const kinds = await query<{ kind: string }>(
      "select kind from activities a join leads l on l.id = a.lead_id where l.reference = $1 order by a.id",
      [reference],
    );
    expect(kinds.map((k) => k.kind)).toEqual(
      expect.arrayContaining(["lead_created", "quote_drafted", "quote_sent", "quote_viewed", "quote_accepted", "booking_created", "agreement_signed", "shipment_status"]),
    );
  });
});

test("expired quote links show expired and cannot be accepted", async ({ page, browser }) => {
  await signIn(page);
  // Seeded lead Q-HB5X8K has a sent quote that expired 5 days ago.
  await page.goto("/leads/a0000000-0000-4000-8000-000000000009");
  await expect(page.getByText("Expired").first()).toBeVisible();
  const [q] = await query<{ id: string }>("select id from quotes where lead_id = 'a0000000-0000-4000-8000-000000000009' and status = 'sent'");
  await expect(page.getByRole("link", { name: "Revise this quote" })).toBeVisible();
  // Seeded links use random hashes, so give this quote a known link for the customer check.
  const { newQuoteLink } = await import("../../src/lib/tokens");
  const l = newQuoteLink(process.env.QUOTE_LINK_SECRET ?? "local-quote-link-secret-0123456789abcdef");
  await query("update quotes set link_id = $1, token_hash = $2 where id = $3", [l.linkId, l.tokenHash, q!.id]);

  const ctx = await browser.newContext();
  const cust = await ctx.newPage();
  await cust.goto(`/q/${l.token}`);
  await expect(cust.getByText(/This quote expired on/)).toBeVisible();
  await expect(cust.getByRole("button", { name: /Accept/ })).toHaveCount(0);
  await ctx.close();
  const bookings = await query("select count(*)::int as n from bookings where lead_id = 'a0000000-0000-4000-8000-000000000009'");
  expect(bookings[0]!.n).toBe(0);
});

test("invalid links reveal nothing", async ({ page }) => {
  await page.goto("/q/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByText("This link isn't valid")).toBeVisible();
  await page.goto("/q/not-a-token");
  await expect(page.getByText("This link isn't valid")).toBeVisible();
});

test("staff area requires sign-in and Admin-only pages enforce roles", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await page.goto("/leads/a0000000-0000-4000-8000-000000000008");
  await expect(page).toHaveURL(/\/login/);

  await signIn(page);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/dashboard\?error=admin_only/);
  await expect(page.getByText("That page is for admins only.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
});

test("phone leads can be created for an existing customer without duplicating them", async ({ page }) => {
  await signIn(page);
  await page.goto("/customers/c0000000-0000-4000-8000-000000000004");
  await page.getByRole("link", { name: "+ New shipment for this customer" }).click();
  await expect(page.getByRole("heading", { name: "New shipment for Tom Becker" })).toBeVisible();
  await page.fill("#f-pickup_city", "Mesa");
  await page.selectOption("#f-pickup_state", "AZ");
  await page.fill("#f-pickup_zip", "85201");
  await page.fill("#f-delivery_city", "Denver");
  await page.selectOption("#f-delivery_state", "CO");
  await page.fill("#f-delivery_zip", "80202");
  await page.fill('input[name="vehicles.0.year"]', "2018");
  await page.fill('input[name="vehicles.0.make"]', "Audi");
  await page.fill('input[name="vehicles.0.model"]', "R8");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: "Tom Becker" })).toBeVisible();
  await expect(page.getByText(/Repeat customer: 2 other shipments/)).toBeVisible();
  const customers = await query("select count(*)::int as n from customers where lower(email) = 'tbecker@example.com'");
  expect(customers[0]!.n).toBe(1);

  // schedule a follow-up and mark the lead lost with a reason
  await page.fill("#fu_note", "Call Tom about dates");
  await page.getByRole("button", { name: "Schedule follow-up" }).click();
  await expect(page.getByText("Follow-up scheduled.")).toBeVisible();
  await page.getByRole("button", { name: "Mark lost" }).click();
  await page.selectOption("#reason", "Price too high");
  await page.getByRole("button", { name: "Mark lost" }).last().click();
  await expect(page.getByText(/^Lost$/).first()).toBeVisible();
  await expect(page.getByText(/Marked Lost: Price too high/)).toBeVisible();
});
