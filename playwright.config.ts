import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    extraHTTPHeaders: {
      "x-projectspice-ai-provider": "mock",
    },
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "RECIPE_AI_PROVIDER=mock OPENAI_API_KEY=mock pnpm exec react-router dev --host 127.0.0.1 --port 4173 --strictPort",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:4173",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
