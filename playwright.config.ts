import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PROJECTSPICE_SMOKE_BASE_URL ?? "http://127.0.0.1:5173";
const usesExternalServer = Boolean(process.env.PROJECTSPICE_SMOKE_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: usesExternalServer
    ? undefined
    : {
        command: "pnpm smoke:setup && pnpm dev --host 127.0.0.1 --port 5173",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
