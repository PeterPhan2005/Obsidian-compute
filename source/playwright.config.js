import { defineConfig } from "@playwright/test";
const project = process.env.OBSIDIAN_VERIFY_PROJECT || "manual";
if (!/^(?:manual|obsidian-test-[a-f0-9]{32})$/.test(project)) {
  throw new Error("Invalid Playwright artifact project name.");
}
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: `./playwright-report/${project}`, open: "never" }],
  ],
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:8081",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  outputDir: `./test-results/${project}`,
});
