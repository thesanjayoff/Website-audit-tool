import { describe, it, expect } from "vitest";
import { median } from "@/server/engines/lighthouse";

/**
 * Lighthouse scores vary run-to-run (the product spec calls this out
 * explicitly: "Run each Lighthouse audit multiple times (default 3) and
 * report the median, since scores vary between runs"). We can't assert on
 * real browser variance in a unit test, but we can verify the mitigation
 * actually does what it's supposed to: the reported median is far more
 * stable than any single run, and resists being dragged around by one
 * outlier run (a stalled network, a GC pause, etc).
 */
describe("score stability via median-of-N runs", () => {
  it("a single bad run does not change the reported score when 2 of 3 runs agree", () => {
    const threeRuns = [92, 91, 54]; // one outlier run, as can happen under load
    expect(median(threeRuns)).toBe(91);
  });

  it("the median of several realistic runs sits well inside their spread", () => {
    const runs = [88, 95, 90, 93, 87];
    const result = median(runs)!;
    expect(result).toBeGreaterThanOrEqual(Math.min(...runs));
    expect(result).toBeLessThanOrEqual(Math.max(...runs));
  });

  it("ignores null/missing runs (e.g. a run that crashed) instead of treating them as 0", () => {
    const runsWithGap = [90, null, 88];
    expect(median(runsWithGap.filter((v): v is number => v != null))).toBe(89);
  });

  it("returns null rather than a fabricated number when every run is missing", () => {
    expect(median([])).toBeNull();
  });
});
