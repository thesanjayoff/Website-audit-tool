import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchCruxSummary, fetchCruxHistory } from "@/server/engines/crux";

describe("CrUX field data: missing/absent data handling", () => {
  const originalKey = process.env.CRUX_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.CRUX_API_KEY;
    else process.env.CRUX_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("reports hasData:false (never throws) when no API key is configured", async () => {
    delete process.env.CRUX_API_KEY;
    const result = await fetchCruxSummary({ url: "https://example.com/" });
    expect(result.hasData).toBe(false);
    expect(result.scope).toBe("page");
    expect(result.metrics).toBeUndefined();
  });

  it("reports hasData:false on a CrUX 404 (no data for this URL) rather than treating it as an error", async () => {
    process.env.CRUX_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ error: { code: 404, message: "Chrome UX Report data not found" } }),
    }) as unknown as typeof fetch;

    const result = await fetchCruxSummary({ url: "https://example.com/" });
    expect(result.hasData).toBe(false);
  });

  it("uses origin scope when only an origin is given", async () => {
    delete process.env.CRUX_API_KEY;
    const result = await fetchCruxSummary({ origin: "https://example.com" });
    expect(result.scope).toBe("origin");
    expect(result.hasData).toBe(false);
  });

  it("never fabricates lab data as field data: hasData stays false even on a network error", async () => {
    process.env.CRUX_API_KEY = "test-key";
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const result = await fetchCruxSummary({ url: "https://example.com/" });
    expect(result.hasData).toBe(false);
  });

  it("fetchCruxHistory returns an empty array (not a throw) when no API key is configured", async () => {
    delete process.env.CRUX_API_KEY;
    const history = await fetchCruxHistory({ url: "https://example.com/" });
    expect(history).toEqual([]);
  });
});
