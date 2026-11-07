import { defineConfig, devices } from '@playwright/test';

/** Browser-only demo bundle smoke tests run against the compiled /demo/ artifact. */
export default defineConfig({
  testDir: './demo-e2e',
  reporter: 'list',
  retries: 0,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/serve-demo-build.mjs',
    url: 'http://127.0.0.1:4174/demo/',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
