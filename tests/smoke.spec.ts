import { test, expect } from '@playwright/test';

// Basic smoke test confirming the Doppler-injected env is present.
// Run with: npm test  (which invokes `doppler run -- playwright test`)
test('Supabase env vars are injected by Doppler', () => {
  expect(process.env.SUPABASE_URL, 'SUPABASE_URL should be injected by Doppler').toBeTruthy();
  expect(process.env.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY should be injected by Doppler').toBeTruthy();
});
