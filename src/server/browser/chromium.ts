import { chromium, type Browser, type BrowserContext } from "playwright";

let sharedBrowser: Browser | null = null;

/**
 * One shared, sandboxed Chromium instance for the whole process. Every page
 * we create from it is routed through a fresh, isolated BrowserContext with
 * no filesystem access, no persistent storage, and JS enabled only because
 * audited pages need to render — never given access to local files or
 * extensions. Treat all content it renders as untrusted.
 */
export async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  sharedBrowser = await chromium.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox", // containerized/CI hosts commonly lack a user namespace for Chromium's own sandbox
      "--disable-extensions",
      "--disable-background-networking",
    ],
  });
  return sharedBrowser;
}

export async function newIsolatedContext(opts: {
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor?: number;
  isMobile?: boolean;
}): Promise<BrowserContext> {
  const browser = await getSharedBrowser();
  return browser.newContext({
    viewport: opts.viewport,
    userAgent: opts.userAgent,
    deviceScaleFactor: opts.deviceScaleFactor ?? 1,
    isMobile: opts.isMobile ?? false,
    javaScriptEnabled: true,
    acceptDownloads: false,
    bypassCSP: false,
    serviceWorkers: "block",
  });
}

export function chromiumExecutablePath(): string {
  return chromium.executablePath();
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export const DEVICE_PROFILES = {
  mobile: {
    viewport: { width: 412, height: 823 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 WebsiteAuditToolBot/1.0",
    isMobile: true,
    deviceScaleFactor: 2.625,
  },
  desktop: {
    viewport: { width: 1366, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 WebsiteAuditToolBot/1.0",
    isMobile: false,
    deviceScaleFactor: 1,
  },
} as const;
