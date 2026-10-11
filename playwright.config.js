import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4317",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/fixtures/own-app.mjs",
      url: "http://127.0.0.1:4318",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run start",
      url: "http://127.0.0.1:4317",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: "4317",
        NODE_ENV: "test",
        DEMOFORGE_TARGET_ORIGIN: "http://127.0.0.1:4318",
      },
    },
  ],
});
