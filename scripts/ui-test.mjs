#!/usr/bin/env node
// WatchDeck browser UI self-test (optional; requires `playwright-core` and a
// Chromium binary). Drives a running instance of the app at three viewports
// — iPhone SE (375x667), iPad (768x1024), desktop (1440x900) — and verifies:
//   1. the home page renders with no horizontal scroll,
//   2. a signed-out user can search and gets a grid of result cards,
//   3. the Embed toggle swaps a card body to a youtube-nocookie iframe,
//   4. the Summarize sheet opens and renders a non-empty summary,
//   5. the header collapses to a hamburger menu on small viewports.
// Saves screenshots to selfcheck-artifacts/ and prints a PASS/FAIL table.
//
// Usage: node scripts/ui-test.mjs [baseUrl] [chromiumPath]
//   baseUrl default: http://localhost:3113
//   chromiumPath default: $CHROMIUM_PATH or /opt/pw-browsers/chromium

import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:3113';
const CHROMIUM =
  process.argv[3] || process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOT_DIR = path.join(process.cwd(), 'selfcheck-artifacts');

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'ipad', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const results = [];
function record(name, ok, detail) {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name} — ${detail}`);
}

async function hasHorizontalScroll(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1; // 1px tolerance
  });
}

async function main() {
  const { chromium } = await import('playwright-core');
  await fs.mkdir(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent:
          vp.width < 768
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
            : undefined,
      });
      const page = await context.newPage();

      // 1. Home renders, no horizontal scroll.
      await page.goto(BASE, { waitUntil: 'networkidle' });
      const homeScroll = await hasHorizontalScroll(page);
      record(
        `${vp.name}: home no-h-scroll`,
        !homeScroll,
        homeScroll ? 'horizontal scrollbar present' : `clean at ${vp.width}px`,
      );

      // 5. Header: hamburger under 768px, full nav at >= 768px.
      const hamburgerVisible = await page
        .locator('header button:has(svg)')
        .first()
        .isVisible()
        .catch(() => false);
      const desktopNavVisible = await page
        .locator('header nav a[href="/watchlist"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (vp.width < 768) {
        record(
          `${vp.name}: header collapses`,
          hamburgerVisible && !desktopNavVisible,
          `hamburger=${hamburgerVisible} desktopNav=${desktopNavVisible}`,
        );
      } else {
        record(
          `${vp.name}: header full nav`,
          desktopNavVisible,
          `desktopNav=${desktopNavVisible}`,
        );
      }

      // 2. Signed-out search works.
      const input = page.locator('input[type="search"], input[placeholder*="earch"], form input').first();
      await input.fill('never gonna give you up');
      await input.press('Enter');
      await page.waitForResponse(
        (r) => r.url().includes('/api/search') && r.status() === 200,
        { timeout: 45_000 },
      );
      await page.waitForTimeout(500);
      const cardCount = await page.locator('img[src*="i.ytimg.com"]').count();
      record(
        `${vp.name}: search grid`,
        cardCount >= 5,
        `${cardCount} result thumbnails rendered`,
      );
      const searchScroll = await hasHorizontalScroll(page);
      record(
        `${vp.name}: results no-h-scroll`,
        !searchScroll,
        searchScroll ? 'horizontal scrollbar present' : `clean at ${vp.width}px`,
      );

      await page.screenshot({
        path: path.join(SHOT_DIR, `ui-${vp.name}-results.png`),
        fullPage: false,
      });

      // 3 + 4 only need to run once (functional, not responsive) — desktop.
      if (vp.name === 'desktop') {
        const embedBtn = page.getByRole('button', { name: /embed/i }).first();
        if (await embedBtn.isVisible().catch(() => false)) {
          await embedBtn.click();
          const iframeVisible = await page
            .locator('iframe[src*="youtube-nocookie.com/embed/"]')
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
          record('desktop: embed toggle', iframeVisible, `nocookie iframe visible=${iframeVisible}`);
        } else {
          record('desktop: embed toggle', false, 'no Embed button found on a result card');
        }

        const sumBtn = page.getByRole('button', { name: /summarize/i }).first();
        if (await sumBtn.isVisible().catch(() => false)) {
          await sumBtn.click();
          await page
            .waitForResponse((r) => r.url().includes('/api/summarize'), { timeout: 60_000 })
            .catch(() => null);
          await page.waitForTimeout(800);
          const sheetText = await page
            .locator('[role="dialog"]')
            .first()
            .innerText()
            .catch(() => '');
          const hasSummary = sheetText.replace(/\s+/g, ' ').length > 80;
          record(
            'desktop: summarize sheet',
            hasSummary,
            hasSummary
              ? `sheet rendered ${sheetText.length} chars`
              : `sheet text too short: "${sheetText.slice(0, 120)}"`,
          );
          await page.screenshot({
            path: path.join(SHOT_DIR, 'ui-desktop-summarize.png'),
          });
        } else {
          record('desktop: summarize sheet', false, 'no Summarize button found');
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const fails = results.filter((r) => r.status === 'FAIL');
  console.log('');
  console.log(`UI self-test: ${results.length - fails.length}/${results.length} passed`);
  console.log(`UI_TEST_JSON:${JSON.stringify(results)}`);
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('ui-test crashed:', err?.stack || String(err));
  process.exit(1);
});
