#!/usr/bin/env node
/**
 * render_cover.js — Render cover.html → cover.pdf via Playwright.
 *
 * Usage:
 *   node render_cover.js --input cover.html --out cover.pdf
 *   node render_cover.js --input cover.html --out cover.pdf --wait 1200
 *
 * Exit codes: 0 success, 1 bad args, 2 dependency missing, 3 render error
 */

const path = require('path');
const fs = require('fs');

function usage() {
  console.error('Usage: node render_cover.js --input <file.html> --out <file.pdf> [--wait <ms>]');
  process.exit(1);
}

// ── Arg parsing ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let inputFile = null,
  outFile = null,
  waitMs = 800;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input' && args[i + 1]) inputFile = args[++i];
  else if (args[i] === '--out' && args[i + 1]) outFile = args[++i];
  else if (args[i] === '--wait' && args[i + 1]) waitMs = parseInt(args[++i], 10);
}

if (!inputFile || !outFile) usage();
if (!fs.existsSync(inputFile)) {
  console.error(JSON.stringify({ status: 'error', error: `File not found: ${inputFile}` }));
  process.exit(1);
}

// ── Playwright loader ─────────────────────────────────────────────────────────
function loadPlaywright() {
  try {
    return require('playwright');
  } catch (_) {}

  try {
    const { execSync } = require('child_process');
    const root = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'], shell: false })
      .toString()
      .trim();

    if (!root || !path.isAbsolute(root) || root.includes('..')) {
      throw new Error('Invalid npm root path');
    }
    const playwrightPath = path.join(root, 'playwright');
    if (fs.existsSync(playwrightPath)) {
      return require(playwrightPath);
    }
  } catch (_) {}

  console.error(
    JSON.stringify({
      status: 'error',
      error: 'playwright not found',
      hint: 'Run: npm install -g playwright && npx playwright install chromium',
    }),
  );
  process.exit(2);
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const { chromium } = loadPlaywright();
  let browser;

  // Launch browser, attempt auto-install if missing
  const tryLaunch = async () => {
    try {
      return await chromium.launch();
    } catch (e) {
      // Try installing chromium
      const { spawn } = require('child_process');
      const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

      try {
        fs.accessSync(require.resolve(npxBin));
      } catch (_) {
        console.error(
          JSON.stringify({
            status: 'error',
            error: 'Chromium not installed and auto-install failed',
            hint: 'Run: npx playwright install chromium',
          }),
        );
        process.exit(2);
      }

      return new Promise((resolve, reject) => {
        const child = spawn(npxBin, ['playwright', 'install', 'chromium'], {
          stdio: 'inherit',
          shell: false,
        });
        child.on('close', async (code) => {
          if (code !== 0) {
            reject(new Error('chromium install failed'));
            return;
          }
          try {
            const b = await chromium.launch();
            resolve(b);
          } catch (err) {
            reject(err);
          }
        });
      });
    }
  };

  try {
    browser = await tryLaunch();
  } catch (e) {
    console.error(
      JSON.stringify({
        status: 'error',
        error: 'Chromium not installed and auto-install failed',
        hint: 'Run: npx playwright install chromium',
      }),
    );
    process.exit(3);
  }

  try {
    const page = await browser.newPage();
    const fileUrl = 'file://' + path.resolve(inputFile);
    await page.goto(fileUrl);
    await page.waitForTimeout(waitMs);

    await page.pdf({
      path: outFile,
      width: '794px',
      height: '1123px',
      printBackground: true,
    });

    await browser.close();

    const stat = fs.statSync(outFile);
    if (stat.size < 5000) {
      console.error(
        JSON.stringify({
          status: 'error',
          error: 'Output PDF is suspiciously small — cover may be blank',
          hint: 'Check cover.html for render errors',
        }),
      );
      process.exit(3);
    }

    console.log(
      JSON.stringify({
        status: 'ok',
        out: outFile,
        size_kb: Math.round(stat.size / 1024),
      }),
    );
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.error(JSON.stringify({ status: 'error', error: String(e) }));
    process.exit(3);
  }
})();
