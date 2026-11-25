import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. Expect the app at E2E_BASE_URL (default http://localhost:3000)
 * backed by a freshly seeded database; `npm run test:e2e:local` sets that up
 * with the local Supabase stand-in.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
