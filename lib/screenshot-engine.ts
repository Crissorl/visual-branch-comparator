import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Browser, BrowserType } from 'playwright';

let playwrightAvailable = false;
let chromiumLauncher: BrowserType | null = null;
let browserInstance: Browser | null = null;

// Lazy check for playwright availability
async function checkPlaywright(): Promise<boolean> {
  if (chromiumLauncher !== null) return playwrightAvailable;
  try {
    const pw = await import('playwright');
    chromiumLauncher = pw.chromium;
    playwrightAvailable = true;
  } catch {
    playwrightAvailable = false;
  }
  return playwrightAvailable;
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance) return browserInstance;
  if (!(await checkPlaywright())) {
    throw new Error('Playwright is not available. Install it with: pnpm add playwright');
  }
  browserInstance = await chromiumLauncher!.launch({ headless: true });
  return browserInstance;
}

export interface CaptureOptions {
  viewport?: { width: number; height: number };
  fullPage?: boolean;
}

export async function capture(
  url: string,
  outputPath: string,
  options?: CaptureOptions,
): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: options?.viewport ?? { width: 1280, height: 720 },
  });

  try {
    // Ensure output directory exists
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({
      path: outputPath,
      fullPage: options?.fullPage ?? true,
    });

    return outputPath;
  } finally {
    await page.close();
  }
}

export async function captureAll(
  sources: Array<{ url: string; outputPath: string; options?: CaptureOptions }>,
): Promise<string[]> {
  // Capture all in parallel using separate pages but shared browser
  const results = await Promise.all(sources.map((s) => capture(s.url, s.outputPath, s.options)));
  return results;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export function isAvailable(): boolean {
  return playwrightAvailable;
}
