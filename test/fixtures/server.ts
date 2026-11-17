import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal static file server for the local test fixtures: a "good" site with
 * no known issues (used to measure false positives) and a "bad" site with a
 * deliberate, documented set of problems for each engine to catch. Good
 * headers are only added under /good/*, so the security-header grader has
 * something real to tell apart.
 */

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITES_DIR = path.join(ROOT, "sites");
const PORT = Number(process.env.FIXTURES_PORT ?? 4173);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".env": "text/plain",
  ".css": "text/css",
  ".js": "text/javascript",
};

const GOOD_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/good/index.html";

  const resolved = path.normalize(path.join(SITES_DIR, pathname));
  if (!resolved.startsWith(SITES_DIR)) {
    res.writeHead(400).end("Bad request");
    return;
  }

  try {
    const stats = await stat(resolved);
    if (stats.isDirectory()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const data = await readFile(resolved);
    const ext = path.extname(resolved);

    if (pathname.startsWith("/good/")) {
      for (const [key, value] of Object.entries(GOOD_HEADERS)) res.setHeader(key, value);
    } else if (pathname.startsWith("/bad/")) {
      // Deliberately no security headers, plus a version-y Server header.
      res.setHeader("Server", "Apache/2.2.22 (Unix) PHP/5.3.10");
    }

    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`Fixture sites serving at http://127.0.0.1:${PORT}/ (good: /good/index.html, bad: /bad/index.html)`);
});
