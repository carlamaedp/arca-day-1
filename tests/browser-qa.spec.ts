import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Browser QA sweep of the live Carma Studio site:
//   1. Load the home page and screenshot it.
//   2. Discover every link in the nav and footer.
//   3. Follow only INTERNAL links (same host). External links (Instagram,
//      LinkedIn, Behance, mailto:, …) are skipped — they're slow, may block
//      bots, and aren't what we're testing.
//   4. For each internal page: verify HTTP 200, no obvious error text, and
//      screenshot it.
//   5. Confirm the contact form's required-field validation blocks an empty
//      submission.
//   6. Emit a markdown report (tests/qa-report.md) summarising every page.
//
// Env (injected by Doppler via `doppler run -- playwright test`):
//   SITE_URL — optional override for the site under test

const RAW_SITE_URL =
  process.env.SITE_URL || 'https://carma-studio-landing-page.vercel.app';
const SITE_URL = /^https?:\/\//i.test(RAW_SITE_URL)
  ? RAW_SITE_URL
  : `https://${RAW_SITE_URL}`;

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const REPORT_PATH = path.join(__dirname, 'qa-report.md');

// Text that would indicate a broken page. Checked against visible body text.
const ERROR_TEXT = /(404|page not found|not found|application error|something went wrong|internal server error|this page could not be found)/i;

interface PageResult {
  name: string;
  url: string;
  status: number | string;
  hasNav: boolean;
  hasFooter: boolean;
  screenshot: string;
  errorText: boolean;
}

// Turn a URL path into a safe, readable screenshot slug.
function slugFor(url: string): string {
  const { pathname } = new URL(url);
  const base = pathname.replace(/\.html?$/i, '').replace(/^\/|\/$/g, '');
  return base === '' ? 'home' : base.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

async function capturePageState(page: Page): Promise<{
  hasNav: boolean;
  hasFooter: boolean;
  errorText: boolean;
}> {
  const hasNav = (await page.locator('nav#nav, nav.nav').count()) > 0;
  const hasFooter = (await page.locator('footer.foot, footer').count()) > 0;
  const bodyText = await page.locator('body').innerText();
  return { hasNav, hasFooter, errorText: ERROR_TEXT.test(bodyText) };
}

test('browser QA sweep of nav/footer pages and contact-form validation', async ({
  page,
}) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const results: PageResult[] = [];

  // --- 1. Home page ---------------------------------------------------------
  const homeResponse = await page.goto(SITE_URL, {
    waitUntil: 'domcontentloaded',
  });
  const homeShot = path.join(SCREENSHOT_DIR, 'home.png');
  await page.screenshot({ path: homeShot, fullPage: true });
  const homeUrl = page.url();
  const homeState = await capturePageState(page);
  results.push({
    name: 'Home',
    url: homeUrl,
    status: homeResponse?.status() ?? 'unknown',
    hasNav: homeState.hasNav,
    hasFooter: homeState.hasFooter,
    screenshot: path.relative(process.cwd(), homeShot),
    errorText: homeState.errorText,
  });
  expect(homeResponse?.status(), 'home page should return 200').toBe(200);
  expect(homeState.errorText, 'home page should have no error text').toBe(false);

  // --- 2. Discover nav + footer links ---------------------------------------
  const siteOrigin = new URL(homeUrl).origin;
  const homeKey = new URL(homeUrl).origin + new URL(homeUrl).pathname;

  const rawLinks = await page.$$eval('nav#nav a, footer a', (els) =>
    (els as HTMLAnchorElement[]).map((a) => ({
      raw: a.getAttribute('href') || '',
      abs: a.href, // browser-resolved absolute URL
      text: (a.textContent || '').trim(),
    }))
  );

  // Keep only same-origin http(s) links, drop the fragment, and skip anything
  // that just points back at the home page (e.g. "#top", "#contact").
  const seen = new Set<string>();
  const internalLinks: { raw: string; target: string; text: string }[] = [];
  for (const link of rawLinks) {
    let parsed: URL;
    try {
      parsed = new URL(link.abs);
    } catch {
      continue;
    }
    if (parsed.origin !== siteOrigin) continue; // external / mailto / tel
    const key = parsed.origin + parsed.pathname;
    if (key === homeKey) continue; // pure fragment or self-link
    if (seen.has(key)) continue; // dedupe
    seen.add(key);
    internalLinks.push({
      raw: link.raw,
      target: parsed.origin + parsed.pathname,
      text: link.text || slugFor(parsed.href),
    });
  }

  console.log(
    `Discovered ${rawLinks.length} nav/footer links; ${internalLinks.length} internal:`
  );
  internalLinks.forEach((l) => console.log(`  • ${l.text} -> ${l.target}`));

  // --- 3. Visit each internal link by clicking it, then return home ---------
  for (const link of internalLinks) {
    // Start from home so the link is present to click.
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });

    const anchor = page.locator(`a[href="${link.raw}"]`).first();
    let status: number | string = 'unknown';
    try {
      const [response] = await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        anchor.click(),
      ]);
      status = response?.status() ?? 'unknown';
    } catch (err) {
      status = `nav-error: ${(err as Error).message.split('\n')[0]}`;
    }

    const state = await capturePageState(page);
    const shot = path.join(SCREENSHOT_DIR, `${slugFor(link.target)}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    results.push({
      name: link.text,
      url: page.url(),
      status,
      hasNav: state.hasNav,
      hasFooter: state.hasFooter,
      screenshot: path.relative(process.cwd(), shot),
      errorText: state.errorText,
    });

    // Assertions per page: 200 and no error text.
    expect(status, `${link.text} should return 200`).toBe(200);
    expect(state.errorText, `${link.text} should have no error text`).toBe(
      false
    );
  }

  // --- 4. Return home -------------------------------------------------------
  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });

  // --- 5. Contact form: empty submission must be blocked by the browser -----
  await test.step('Empty contact form is blocked by required-field validation', async () => {
    const form = page.locator('#contactForm');
    await form.scrollIntoViewIfNeeded();
    await expect(form).toBeVisible();

    // Submit with all fields empty.
    await page.click('.cf-submit');

    // Native constraint validation should mark required fields invalid and stop
    // the submit handler from ever running, so the status line stays hidden.
    const nameValid = await page
      .locator('#cf-name')
      .evaluate((el: HTMLInputElement) => el.checkValidity());
    const emailValid = await page
      .locator('#cf-email')
      .evaluate((el: HTMLInputElement) => el.checkValidity());

    expect(nameValid, 'empty required name should be invalid').toBe(false);
    expect(emailValid, 'empty required email should be invalid').toBe(false);

    // The submit handler calls showStatus() (which un-hides #cfStatus). If the
    // browser blocked submission, it never ran, so the status stays hidden.
    await expect(
      page.locator('#cfStatus'),
      'status message must not appear when submission is blocked'
    ).toBeHidden();

    console.log('✓ Empty contact form was blocked by browser validation');
  });

  // --- 6. Write the markdown report -----------------------------------------
  const rows = results
    .map(
      (r) =>
        `| ${r.name} | ${r.url} | ${r.status}${
          r.errorText ? ' ⚠️ error text' : ''
        } | ${r.hasNav ? '✅' : '❌'} | ${r.hasFooter ? '✅' : '❌'} | ${
          r.screenshot
        } |`
    )
    .join('\n');

  const report = `# Browser QA Report

**Site:** ${SITE_URL}
**Pages checked:** ${results.length}

| Page name | URL | Status | Has nav | Has footer | Screenshot path |
| --- | --- | --- | --- | --- | --- |
${rows}

_External links (social media, mailto:) were intentionally skipped._
`;

  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`✓ Wrote QA report to ${path.relative(process.cwd(), REPORT_PATH)}`);
});
