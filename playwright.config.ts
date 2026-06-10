import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4174",
    extraHTTPHeaders: {
      "x-projectspice-auth-bypass": "1",
      "x-projectspice-ai-provider": "mock",
    },
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "PROJECTSPICE_AUTH_BYPASS=1 RECIPE_AI_PROVIDER=mock VITE_CLERK_PUBLISHABLE_KEY=pk_test_mock CLERK_SECRET_KEY=sk_test_mock OPENAI_API_KEY=mock pnpm exec react-router dev --host 127.0.0.1 --port 4174 --strictPort",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4174/?projectspice_auth_bypass=1",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
