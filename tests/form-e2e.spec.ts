import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// End-to-end test of the Carma Studio contact form:
//   1. Loads the live site, fills and submits the contact form, and confirms
//      the success message appears.
//   2. Independently queries Supabase to confirm the row was actually written.
//   3. A teardown hook deletes the test rows afterwards so the database (and the
//      admin submissions page) stay clean.
//
// The two checks live in separate test.step() blocks so that if the form
// submission succeeds but the database write did not land, the failure points
// clearly at the database step rather than the UI step.
//
// Env (injected by Doppler via `doppler run -- playwright test`):
//   SITE_URL           — optional override for the site under test
//   SUPABASE_URL       — Supabase project URL
//   SUPABASE_ANON_KEY  — Supabase anon key

// SITE_URL may come from Doppler without a scheme (e.g. "example.vercel.app");
// prepend https:// so page.goto always gets an absolute URL.
const RAW_SITE_URL =
  process.env.SITE_URL || 'https://carma-studio-landing-page.vercel.app';
const SITE_URL = /^https?:\/\//i.test(RAW_SITE_URL)
  ? RAW_SITE_URL
  : `https://${RAW_SITE_URL}`;

// Every test email uses this prefix so the teardown can reliably find and
// remove test rows — including any left behind by an earlier interrupted run.
const TEST_EMAIL_PREFIX = 'playwright-test+';

function supabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  expect(supabaseUrl, 'SUPABASE_URL must be injected by Doppler').toBeTruthy();
  expect(supabaseKey, 'SUPABASE_ANON_KEY must be injected by Doppler').toBeTruthy();
  return createClient(supabaseUrl!, supabaseKey!);
}

test('contact form submits and persists to Supabase', async ({ page }) => {
  // Unique email per run so repeated test runs never collide on a duplicate.
  const timestamp = Date.now();
  const testEmail = `${TEST_EMAIL_PREFIX}${timestamp}@example.com`;
  const testName = 'Playwright Test User';
  const testMessage = 'This is an automated test submission';

  await test.step('Submit the form on the live site', async () => {
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });

    // Scroll the contact form into view.
    const form = page.locator('#contactForm');
    await form.scrollIntoViewIfNeeded();
    await expect(form).toBeVisible();

    // Fill the fields.
    await page.fill('#cf-name', testName);
    await page.fill('#cf-email', testEmail);
    await page.fill('#cf-message', testMessage);

    // Submit.
    await page.click('.cf-submit');

    // Verify the success message appears within 5 seconds. On success the
    // status line shows "Thanks — your message is on its way." and gets the
    // cf-status--ok class.
    const status = page.locator('#cfStatus');
    await expect(status).toBeVisible({ timeout: 5000 });
    await expect(status).toHaveClass(/cf-status--ok/, { timeout: 5000 });
    await expect(status).toContainText('Thanks', { timeout: 5000 });

    console.log(`✓ Form submitted — success message shown for ${testEmail}`);
  });

  await test.step('Verify the row exists in Supabase', async () => {
    const supabase = supabaseClient();

    // The insert happens server-side after the HTTP response returns, so give
    // it a brief window and poll until the row shows up (or time out).
    await expect
      .poll(
        async () => {
          const { data, error } = await supabase
            .from('signups')
            .select('name, email, message')
            .eq('email', testEmail)
            .maybeSingle();
          if (error) {
            console.error('Supabase query error:', error.message);
            return null;
          }
          return data;
        },
        {
          message: `Expected a signups row for ${testEmail}`,
          timeout: 10000,
          intervals: [500, 1000, 1000, 2000],
        }
      )
      .not.toBeNull();

    // Confirm the persisted values match what we submitted.
    const { data } = await supabase
      .from('signups')
      .select('name, email, message')
      .eq('email', testEmail)
      .single();

    expect(data?.name).toBe(testName);
    expect(data?.email).toBe(testEmail);
    expect(data?.message).toBe(testMessage);

    console.log(`✓ Verified Supabase row for ${testEmail}`);
  });
});

// Teardown: remove any rows created by this test file. Runs after the test(s)
// complete, whether they passed or failed, so test data never accumulates.
// Matches the shared prefix via LIKE so a partial/interrupted run is cleaned up
// too. Deleting after all tests keeps the verification step's assertions intact.
test.afterAll(async () => {
  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from('signups')
    .delete()
    .like('email', `${TEST_EMAIL_PREFIX}%@example.com`)
    .select('id');

  if (error) {
    console.error('Teardown: failed to delete test rows:', error.message);
    return;
  }
  console.log(`✓ Teardown removed ${data?.length ?? 0} test row(s)`);
});
