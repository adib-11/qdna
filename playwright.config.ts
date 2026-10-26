import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the built app (`npm run build` first). Gemini is
 * stubbed at the network level in `e2e/fixtures.ts`, so no test ever reaches
 * Google or needs a real key.
 */
const PORT = Number(process.env.PORT ?? 3108);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
