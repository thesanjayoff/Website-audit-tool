import tls from "node:tls";
import { URL } from "node:url";
import { safeFetch } from "../security/ssrf";
import { CRAWL_DEFAULTS, CERT_EXPIRY_WARNING_DAYS } from "../config/thresholds";
import { SECURITY_HEADER_WEIGHTS } from "../config/thresholds";
import type { TlsInfo } from "../db/schema";
import type { FindingDraft } from "./types";

export type HeaderCheckResult = {
  headers: Record<string, string>;
  score: number; // 0-100
  findings: FindingDraft[];
};

function parseCspDirectives(csp: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    if (name) directives[name.toLowerCase()] = values;
  }
  return directives;
}

function parseSetCookies(headers: Record<string, string>): string[] {
  // undici folds multiple Set-Cookie headers into one comma/newline-joined
  // string under `headers.get`; fetch's `getSetCookie()` isn't available on
  // our plain Record, so split heuristically on ", " followed by a token=.
  const raw = headers["set-cookie"];
  if (!raw) return [];
  return raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/g).map((s) => s.trim());
}

export function gradeSecurityHeaders(headers: Record<string, string>, pageUrl: string): HeaderCheckResult {
  const findings: FindingDraft[] = [];
  let earned = 0;
  const maxPoints = Object.values(SECURITY_HEADER_WEIGHTS).reduce((a, b) => a + b, 0);

  const csp = headers["content-security-policy"];
  if (!csp) {
    findings.push(makeHeaderFinding(
      "Missing Content-Security-Policy header",
      "There is no Content-Security-Policy (CSP) header, so the browser has no extra protection against injected scripts (XSS) beyond the page's own code.",
      "high",
      pageUrl,
      "Add a Content-Security-Policy header, starting with a report-only policy to avoid breaking the site, e.g. `Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self'`.",
    ));
  } else {
    earned += SECURITY_HEADER_WEIGHTS["content-security-policy"];
    const directives = parseCspDirectives(csp);
    if (directives["script-src"]?.includes("'unsafe-inline'") || (!directives["script-src"] && directives["default-src"]?.includes("'unsafe-inline'"))) {
      findings.push(makeHeaderFinding(
        "Content-Security-Policy allows 'unsafe-inline' scripts",
        "The CSP permits inline scripts, which significantly weakens its protection against cross-site scripting.",
        "medium",
        pageUrl,
        "Move inline scripts to external files and remove 'unsafe-inline' from script-src, or use nonces/hashes.",
      ));
    }
  }

  const hsts = headers["strict-transport-security"];
  if (!hsts) {
    findings.push(makeHeaderFinding(
      "Missing Strict-Transport-Security (HSTS) header",
      "Without HSTS, browsers may connect over plain HTTP before being redirected, leaving a window for interception.",
      "medium",
      pageUrl,
      "Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` once the site is confirmed to always serve HTTPS.",
    ));
  } else {
    earned += SECURITY_HEADER_WEIGHTS["strict-transport-security"];
    const maxAgeMatch = /max-age=(\d+)/i.exec(hsts);
    if (maxAgeMatch && Number(maxAgeMatch[1]) < 15552000) {
      findings.push(makeHeaderFinding(
        "Strict-Transport-Security max-age is short",
        `HSTS max-age is set to ${maxAgeMatch[1]} seconds, below the commonly recommended 6 months (15552000s).`,
        "low",
        pageUrl,
        "Increase max-age to at least 15552000 (6 months), ideally 31536000 (1 year) with includeSubDomains.",
      ));
    }
  }

  const xcto = headers["x-content-type-options"];
  if (!xcto || xcto.toLowerCase() !== "nosniff") {
    findings.push(makeHeaderFinding(
      "Missing X-Content-Type-Options header",
      "Without `X-Content-Type-Options: nosniff`, some browsers may try to guess (\"sniff\") a file's type, which can be abused to run a file as script.",
      "low",
      pageUrl,
      "Add `X-Content-Type-Options: nosniff` to every response.",
    ));
  } else {
    earned += SECURITY_HEADER_WEIGHTS["x-content-type-options"];
  }

  const xfo = headers["x-frame-options"];
  const frameAncestors = csp ? parseCspDirectives(csp)["frame-ancestors"] : undefined;
  if (!xfo && !frameAncestors) {
    findings.push(makeHeaderFinding(
      "No clickjacking protection (X-Frame-Options or frame-ancestors)",
      "The page can be embedded in an iframe on another site, which can be used for clickjacking attacks that trick users into clicking something different from what they see.",
      "medium",
      pageUrl,
      "Add `X-Frame-Options: DENY` (or `SAMEORIGIN` if you intentionally frame your own pages) or a CSP `frame-ancestors` directive.",
    ));
  } else {
    earned += SECURITY_HEADER_WEIGHTS["x-frame-options-or-frame-ancestors"];
  }

  const referrerPolicy = headers["referrer-policy"];
  if (!referrerPolicy) {
    findings.push(makeHeaderFinding(
      "Missing Referrer-Policy header",
      "Without a Referrer-Policy, full page URLs (sometimes including sensitive query parameters) may be leaked to third parties via the Referer header.",
      "low",
      pageUrl,
      "Add `Referrer-Policy: strict-origin-when-cross-origin` as a safe default.",
    ));
  } else {
    earned += SECURITY_HEADER_WEIGHTS["referrer-policy"];
  }

  const permissionsPolicy = headers["permissions-policy"];
  if (!permissionsPolicy) {
    findings.push(makeHeaderFinding(
      "Missing Permissions-Policy header",
      "Without a Permissions-Policy, there is no explicit control over which browser features (camera, microphone, geolocation, etc.) this page or embedded third parties can use.",
      "low",
      pageUrl,
      "Add a `Permissions-Policy` header disabling features the site doesn't use, e.g. `Permissions-Policy: camera=(), microphone=(), geolocation=()`.",
    ));
  } else {
    earned += SECURITY_HEADER_WEIGHTS["permissions-policy"];
  }

  const coop = headers["cross-origin-opener-policy"];
  if (coop) earned += SECURITY_HEADER_WEIGHTS["cross-origin-opener-policy"];

  const cookies = parseSetCookies(headers);
  if (cookies.length === 0) {
    earned += SECURITY_HEADER_WEIGHTS["cookie-flags"];
  } else {
    const badCookies = cookies.filter(
      (c) => !/secure/i.test(c) || !/samesite/i.test(c),
    );
    if (badCookies.length > 0) {
      findings.push(makeHeaderFinding(
        "Cookies missing Secure/SameSite flags",
        `${badCookies.length} of ${cookies.length} cookie(s) set on this page are missing the Secure and/or SameSite flag, which help prevent cookies from being sent over plain HTTP or to other sites.`,
        "medium",
        pageUrl,
        "Set `Secure; SameSite=Lax` (or `Strict`) on every cookie that doesn't need to be sent cross-site; add `HttpOnly` to any cookie JavaScript doesn't need to read.",
      ));
    } else {
      earned += SECURITY_HEADER_WEIGHTS["cookie-flags"];
    }
    const noHttpOnly = cookies.filter((c) => !/httponly/i.test(c) && /session|auth|token/i.test(c));
    if (noHttpOnly.length > 0) {
      findings.push(makeHeaderFinding(
        "Session-like cookie missing HttpOnly flag",
        "A cookie that looks like a session/auth token is missing HttpOnly, meaning JavaScript (including injected malicious scripts) can read it.",
        "high",
        pageUrl,
        "Add the `HttpOnly` flag to any cookie that doesn't need to be read by client-side JavaScript.",
      ));
    }
  }

  const serverHeader = headers["server"];
  const poweredBy = headers["x-powered-by"];
  if ((serverHeader && /\d/.test(serverHeader)) || poweredBy) {
    findings.push(makeHeaderFinding(
      "Server software version exposed",
      `The response advertises server details (${[serverHeader, poweredBy].filter(Boolean).join(", ")}), which makes it easier for an attacker to look up known vulnerabilities for that exact version.`,
      "low",
      pageUrl,
      "Configure the web server/framework to suppress or genericize the Server and X-Powered-By headers.",
    ));
  }

  return {
    headers,
    score: Math.round((earned / maxPoints) * 100),
    findings,
  };
}

function makeHeaderFinding(
  title: string,
  explanation: string,
  severity: FindingDraft["severity"],
  pageUrl: string,
  fixSuggestion: string,
): FindingDraft {
  return {
    category: "security",
    engine: "header-check",
    title,
    explanation,
    businessImpact: "Weak security headers make it easier for attackers to run malicious scripts, hijack sessions, or trick users — which can mean data breaches, defaced pages, or loss of customer trust.",
    severity,
    effort: "low",
    impact: severity === "high" ? "high" : severity === "medium" ? "medium" : "low",
    evidence: [{ pageUrl }],
    fixSuggestion,
    wcagCriteria: [],
  };
}

export async function fetchHeadersAndCookies(pageUrl: string): Promise<Record<string, string>> {
  const res = await safeFetch(pageUrl, { userAgent: CRAWL_DEFAULTS.userAgent, timeoutMs: CRAWL_DEFAULTS.perRequestTimeoutMs });
  return res.headers;
}

export async function checkHttpsRedirect(pageUrl: string): Promise<boolean | null> {
  const parsed = new URL(pageUrl);
  if (parsed.protocol !== "https:") return null;
  try {
    const httpUrl = `http://${parsed.host}${parsed.pathname}`;
    const res = await safeFetch(httpUrl, { userAgent: CRAWL_DEFAULTS.userAgent, timeoutMs: 10_000 });
    return res.finalUrl.startsWith("https://");
  } catch {
    return null;
  }
}

/** Direct TLS handshake (not via HTTP) so we see the real certificate and negotiated protocol/cipher. */
export async function checkTls(hostname: string): Promise<TlsInfo> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        timeout: 10_000,
        rejectUnauthorized: false, // we want to inspect even an invalid cert, not throw
      },
      () => {
        const cert = socket.getPeerCertificate();
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();
        const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
        const daysUntilExpiry = validTo ? Math.round((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

        resolve({
          valid: socket.authorized || false,
          issuer: (cert?.issuer?.O || cert?.issuer?.CN) ? String(cert.issuer.O || cert.issuer.CN) : null,
          validFrom: cert?.valid_from ?? null,
          validTo: cert?.valid_to ?? null,
          daysUntilExpiry,
          protocol: protocol ?? null,
          cipher: cipher?.name ?? null,
          httpsRedirect: null,
          error: socket.authorized ? null : socket.authorizationError?.toString() ?? "Certificate not trusted",
        });
        socket.end();
      },
    );
    socket.on("error", (err) => {
      resolve({
        valid: false,
        issuer: null,
        validFrom: null,
        validTo: null,
        daysUntilExpiry: null,
        protocol: null,
        cipher: null,
        httpsRedirect: null,
        error: err.message,
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        valid: false,
        issuer: null,
        validFrom: null,
        validTo: null,
        daysUntilExpiry: null,
        protocol: null,
        cipher: null,
        httpsRedirect: null,
        error: "TLS connection timed out",
      });
    });
  });
}

export function tlsFindings(tlsInfo: TlsInfo, pageUrl: string): FindingDraft[] {
  const findings: FindingDraft[] = [];
  if (tlsInfo.error && !tlsInfo.valid) {
    findings.push({
      category: "security",
      engine: "tls-check",
      title: "TLS certificate is invalid or untrusted",
      explanation: `The TLS certificate could not be validated: ${tlsInfo.error}`,
      businessImpact: "Visitors' browsers will show a security warning, which erodes trust and can scare away customers before they see the site at all.",
      severity: "critical",
      effort: "medium",
      impact: "high",
      evidence: [{ pageUrl, value: tlsInfo.error }],
      fixSuggestion: "Install a valid certificate from a trusted CA (e.g. via Let's Encrypt) covering this exact hostname, and ensure the full chain is served.",
      wcagCriteria: [],
    });
  }
  if (tlsInfo.daysUntilExpiry != null && tlsInfo.daysUntilExpiry <= CERT_EXPIRY_WARNING_DAYS) {
    findings.push({
      category: "security",
      engine: "tls-check",
      title: tlsInfo.daysUntilExpiry < 0 ? "TLS certificate has expired" : "TLS certificate is expiring soon",
      explanation: `The certificate ${tlsInfo.daysUntilExpiry < 0 ? "expired" : `expires in ${tlsInfo.daysUntilExpiry} day(s)`} (valid to ${tlsInfo.validTo}).`,
      businessImpact: "An expired certificate takes the entire site offline behind a browser warning until it's renewed.",
      severity: tlsInfo.daysUntilExpiry < 0 ? "critical" : "high",
      effort: "low",
      impact: "high",
      evidence: [{ pageUrl, value: String(tlsInfo.daysUntilExpiry) }],
      fixSuggestion: "Renew the certificate now and set up auto-renewal (e.g. certbot) so this doesn't recur.",
      wcagCriteria: [],
    });
  }
  if (tlsInfo.protocol && /TLSv1(\.0|\.1)?$/.test(tlsInfo.protocol) && tlsInfo.protocol !== "TLSv1.2" && tlsInfo.protocol !== "TLSv1.3") {
    findings.push({
      category: "security",
      engine: "tls-check",
      title: `Outdated TLS protocol negotiated (${tlsInfo.protocol})`,
      explanation: `The server negotiated ${tlsInfo.protocol}, which is deprecated and considered insecure.`,
      businessImpact: "Modern browsers may refuse to connect at all, and outdated protocols are more vulnerable to known attacks.",
      severity: "high",
      effort: "medium",
      impact: "medium",
      evidence: [{ pageUrl, value: tlsInfo.protocol }],
      fixSuggestion: "Disable TLS 1.0/1.1 on the server and require TLS 1.2+.",
      wcagCriteria: [],
    });
  }
  return findings;
}

export function mixedContentFindings(html: string, pageUrl: string): FindingDraft[] {
  if (!pageUrl.startsWith("https://")) return [];
  const matches = [...html.matchAll(/(?:src|href)=["']http:\/\/[^"']+["']/gi)].slice(0, 10);
  if (matches.length === 0) return [];
  return [{
    category: "security",
    engine: "mixed-content-check",
    title: "Mixed content: insecure HTTP resources loaded on an HTTPS page",
    explanation: `Found ${matches.length} resource reference(s) loaded over plain HTTP on a page served over HTTPS, which browsers may block or warn about.`,
    businessImpact: "Mixed content can break page functionality (blocked resources) and shows a \"not fully secure\" warning to visitors.",
    severity: "medium",
    effort: "low",
    impact: "medium",
    evidence: matches.map((m) => ({ pageUrl, snippet: m[0] })),
    fixSuggestion: "Change every http:// resource reference to https://, or to a protocol-relative/relative URL.",
    wcagCriteria: [],
  }];
}

const EXPOSED_FILE_PATHS = [".git/config", ".env", ".env.local", "wp-config.php.bak", ".DS_Store"];

export async function checkExposedFiles(baseUrl: string): Promise<FindingDraft[]> {
  const findings: FindingDraft[] = [];
  for (const filePath of EXPOSED_FILE_PATHS) {
    try {
      const url = new URL(`/${filePath}`, baseUrl).toString();
      const res = await safeFetch(url, { userAgent: CRAWL_DEFAULTS.userAgent, timeoutMs: 8000 });
      const looksReal = res.ok && res.body.length > 0 && !/<html/i.test(res.body.slice(0, 200));
      if (looksReal) {
        findings.push({
          category: "security",
          engine: "exposed-file-check",
          title: `Potentially sensitive file publicly accessible: /${filePath}`,
          explanation: `A GET request to /${filePath} returned HTTP ${res.status} with content that doesn't look like a normal 404/error page.`,
          businessImpact: "Files like .git or .env can leak source code, credentials, or API keys directly to anyone who finds the URL.",
          severity: "critical",
          effort: "low",
          impact: "high",
          evidence: [{ pageUrl: url, value: `HTTP ${res.status}` }],
          fixSuggestion: `Remove /${filePath} from the publicly served directory, or configure the web server to block access to dotfiles and VCS directories.`,
          wcagCriteria: [],
        });
      }
      await new Promise((r) => setTimeout(r, CRAWL_DEFAULTS.requestDelayMs));
    } catch {
      // unreachable/blocked — not a finding, just skip
    }
  }
  return findings;
}

const KNOWN_TRACKERS: Record<string, string> = {
  "google-analytics.com": "Analytics (Google Analytics)",
  "googletagmanager.com": "Tag management (Google Tag Manager)",
  "doubleclick.net": "Advertising (Google/DoubleClick)",
  "facebook.net": "Advertising/tracking (Meta Pixel)",
  "connect.facebook.net": "Advertising/tracking (Meta Pixel)",
  "hotjar.com": "Session recording/analytics (Hotjar)",
  "clarity.ms": "Session recording/analytics (Microsoft Clarity)",
  "segment.com": "Customer data platform (Segment)",
  "intercom.io": "Chat/support widget (Intercom)",
  "tiktok.com": "Advertising/tracking (TikTok Pixel)",
  "linkedin.com": "Advertising/tracking (LinkedIn Insight)",
  "hubspot.com": "Marketing automation (HubSpot)",
};

export function inventoryThirdPartyScripts(html: string, pageUrl: string): Array<{ domain: string; category: string }> {
  const origin = new URL(pageUrl).origin;
  const srcMatches = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)];
  const domains = new Set<string>();
  for (const m of srcMatches) {
    try {
      const scriptUrl = new URL(m[1]!, pageUrl);
      if (scriptUrl.origin !== origin) domains.add(scriptUrl.hostname);
    } catch {
      // ignore malformed src
    }
  }
  return [...domains].map((domain) => ({
    domain,
    category: Object.entries(KNOWN_TRACKERS).find(([key]) => domain.endsWith(key))?.[1] ?? "Third-party script (uncategorized)",
  }));
}

const COOKIE_BANNER_MARKERS = [
  "cookieconsent",
  "cookie-consent",
  "cookie_consent",
  "cky-consent",
  "onetrust",
  "cookiebot",
  "cookie-banner",
  "gdpr-cookie",
  "accept cookies",
  "we use cookies",
];

export function detectCookieBanner(html: string): boolean {
  const lower = html.toLowerCase();
  return COOKIE_BANNER_MARKERS.some((marker) => lower.includes(marker));
}

export function detectDirectoryListing(html: string): boolean {
  return /<title>\s*index of \//i.test(html) || /\bindex of \/[\w./-]*\s*<\/title>/i.test(html);
}
