import dns from "node:dns";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import ipaddr from "ipaddr.js";

/**
 * SSRF guard: every outbound audit request (crawler, header checks, exposed-file
 * probes) must go through `safeFetch`. It resolves the hostname itself, rejects
 * private/loopback/link-local/multicast/reserved ranges, pins the dispatcher's
 * connection to the IP it validated (so DNS can't rebind between check and
 * connect), and re-validates every redirect hop the same way.
 */

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024; // 15MB cap per response

function isDisallowedIp(ip: string): boolean {
  const addr = ipaddr.parse(ip);
  const range = addr.range();
  // ipaddr.js ranges: unicast, unspecified, loopback, private, linkLocal,
  // multicast, broadcast, reserved, uniqueLocal (v6), carrierGradeNat, etc.
  return range !== "unicast";
}

async function resolveAndValidate(hostname: string): Promise<string> {
  // Reject literal IPs that are disallowed before even looking up anything else.
  if (ipaddr.isValid(hostname)) {
    if (isDisallowedIp(hostname)) {
      throw new SsrfBlockedError(`Blocked request to non-public address: ${hostname}`);
    }
    return hostname;
  }

  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new SsrfBlockedError(`Could not resolve hostname: ${hostname}`);
  }
  for (const record of records) {
    if (isDisallowedIp(record.address)) {
      throw new SsrfBlockedError(
        `Blocked request to ${hostname}: resolves to non-public address ${record.address}`,
      );
    }
  }
  // Pin to the first validated address for the actual connection.
  const first = records[0];
  if (!first) {
    throw new SsrfBlockedError(`Could not resolve hostname: ${hostname}`);
  }
  return first.address;
}

export type SafeFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  userAgent: string;
  maxRedirects?: number;
};

export type SafeFetchResult = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  finalUrl: string;
  redirectChain: string[];
  truncated: boolean;
};

/**
 * Fetch a URL with SSRF protections and manual redirect handling (each hop is
 * independently validated). Never follows redirects automatically via undici's
 * built-in redirect option, since that would bypass per-hop validation.
 */
export async function safeFetch(
  targetUrl: string,
  opts: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const redirectChain: string[] = [];
  let currentUrl = targetUrl;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = new URL(currentUrl);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      throw new SsrfBlockedError(`Blocked non-HTTP(S) protocol: ${parsed.protocol}`);
    }
    if (parsed.username || parsed.password) {
      throw new SsrfBlockedError("Blocked URL containing embedded credentials");
    }

    const validatedIp = await resolveAndValidate(parsed.hostname);

    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, _options, callback) => {
          callback(null, [{ address: validatedIp, family: ipaddr.parse(validatedIp).kind() === "ipv6" ? 6 : 4 }] as never);
        },
      },
      bodyTimeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      headersTimeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      connectTimeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(currentUrl, {
        method: opts.method ?? "GET",
        headers: {
          "User-Agent": opts.userAgent,
          ...opts.headers,
        },
        redirect: "manual",
        dispatcher: dispatcher as unknown as Dispatcher,
      });
    } finally {
      await dispatcher.close();
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SsrfBlockedError("Redirect without Location header");
      }
      const nextUrl = new URL(location, currentUrl).toString();
      redirectChain.push(nextUrl);
      currentUrl = nextUrl;
      if (hop === maxRedirects) {
        throw new SsrfBlockedError(`Too many redirects (>${maxRedirects}) for ${targetUrl}`);
      }
      continue;
    }

    const reader = response.body?.getReader();
    let received = 0;
    let truncated = false;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.byteLength;
          if (received > MAX_RESPONSE_BYTES) {
            truncated = true;
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
    }
    const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      ok: response.ok,
      status: response.status,
      headers,
      body,
      finalUrl: currentUrl,
      redirectChain,
      truncated,
    };
  }

  throw new SsrfBlockedError(`Too many redirects for ${targetUrl}`);
}

/** Quick synchronous-ish pre-check used by UI/API before kicking off a crawl. */
export async function assertUrlIsAuditable(targetUrl: string): Promise<void> {
  const parsed = new URL(targetUrl);
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SsrfBlockedError(`Only http/https URLs can be audited, got ${parsed.protocol}`);
  }
  await resolveAndValidate(parsed.hostname);
}
