import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertUrlIsAuditable, SsrfBlockedError } from "@/server/security/ssrf";

describe("SSRF protection (assertUrlIsAuditable)", () => {
  const originalAllowlist = process.env.SSRF_ALLOWLIST_HOSTS;

  beforeEach(() => {
    delete process.env.SSRF_ALLOWLIST_HOSTS;
  });
  afterEach(() => {
    if (originalAllowlist === undefined) delete process.env.SSRF_ALLOWLIST_HOSTS;
    else process.env.SSRF_ALLOWLIST_HOSTS = originalAllowlist;
  });

  it("blocks loopback addresses by default", async () => {
    await expect(assertUrlIsAuditable("http://127.0.0.1/")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks RFC1918 private addresses", async () => {
    await expect(assertUrlIsAuditable("http://10.0.0.5/")).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(assertUrlIsAuditable("http://192.168.1.1/")).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(assertUrlIsAuditable("http://172.16.0.1/")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks link-local addresses (e.g. cloud metadata endpoints)", async () => {
    await expect(assertUrlIsAuditable("http://169.254.169.254/")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks non-HTTP(S) protocols", async () => {
    await expect(assertUrlIsAuditable("ftp://example.com/")).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(assertUrlIsAuditable("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("allows a public unicast IP literal", async () => {
    await expect(assertUrlIsAuditable("http://8.8.8.8/")).resolves.toBeUndefined();
  });

  it("the test-only allowlist is opt-in: unset by default, and exact-match when set", async () => {
    await expect(assertUrlIsAuditable("http://127.0.0.1/")).rejects.toBeInstanceOf(SsrfBlockedError);

    process.env.SSRF_ALLOWLIST_HOSTS = "127.0.0.1";
    await expect(assertUrlIsAuditable("http://127.0.0.1/")).resolves.toBeUndefined();

    // Still blocks a different private host even with the allowlist set for another host.
    await expect(assertUrlIsAuditable("http://10.0.0.9/")).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});
