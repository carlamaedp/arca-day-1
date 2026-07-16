import { defineConfig, devices } from '@playwright/test';

// Note: no dotenv here. Tests are run under `doppler run -- playwright test`,
// which injects SUPABASE_URL and SUPABASE_ANON_KEY directly into process.env.
// Doppler is the only source of truth for environment variables.

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
