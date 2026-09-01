import { describe, expect, it } from "vitest";
import { bestSample, estimateOffset } from "./clock";

describe("estimateOffset", () => {
  it("is zero when the clocks agree and latency is symmetric", () => {
    // Sent at 1000, server replied reading 1050 on its clock, received at 1100.
    // rtt 100 -> server clock at receive ~= 1050 + 50 = 1100 -> offset 0.
    expect(estimateOffset(1000, 1050, 1100)).toBe(0);
  });

  it("is positive when the server clock runs ahead of ours", () => {
    // Same exchange, but the server clock is 5s ahead.
    expect(estimateOffset(1000, 6050, 1100)).toBe(5000);
  });

  it("is negative when the server clock runs behind ours", () => {
    expect(estimateOffset(1000, -3950, 1100)).toBe(-5000);
  });

  it("still centres the estimate mid-flight on an asymmetric round trip", () => {
    // rtt 200, server replied reading 2100, received at 2200.
    // estimate: 2100 + 100 - 2200 = 0.
    expect(estimateOffset(2000, 2100, 2200)).toBe(0);
  });
});

describe("bestSample", () => {
  it("picks the sample with the lowest round trip", () => {
    const samples = [
      { rtt: 120, offset: 40 },
      { rtt: 30, offset: 12 },
      { rtt: 80, offset: 25 },
    ];
    expect(bestSample(samples)).toEqual({ rtt: 30, offset: 12 });
  });

  it("returns the first sample when round trips tie", () => {
    const samples = [
      { rtt: 50, offset: 5 },
      { rtt: 50, offset: 9 },
    ];
    expect(bestSample(samples)).toEqual({ rtt: 50, offset: 5 });
  });

  it("returns null when there are no samples", () => {
    expect(bestSample([])).toBeNull();
  });
});
