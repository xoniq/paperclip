import { describe, expect, it } from "vitest";
import { computeBudget, DAY_MS, HOUR_MS, type SendLogEntry } from "../src/state.js";

const NOW = 1_800_000_000_000;

function entry(agoMs: number, ok = true): SendLogEntry {
  return { at: NOW - agoMs, to: ["a@example.com"], subject: "s", ok, source: "agent" };
}

const LIMITS = { maxPerHour: 3, maxPerDay: 5 };

describe("computeBudget", () => {
  it("counts only attempts inside each window", () => {
    const budget = computeBudget(
      [entry(1000), entry(30 * 60_000), entry(2 * HOUR_MS), entry(2 * DAY_MS)],
      LIMITS,
      NOW,
    );
    expect(budget.hourUsed).toBe(2);
    expect(budget.dayUsed).toBe(3);
    expect(budget.retryAt).toBeNull();
  });

  it("counts failures as well as successes", () => {
    // A retry loop against a refusing server is exactly what the limit is for.
    const budget = computeBudget([entry(1000, false), entry(2000, false), entry(3000, false)], LIMITS, NOW);
    expect(budget.hourUsed).toBe(3);
    expect(budget.retryAt).not.toBeNull();
  });

  it("reports when the hourly window frees its next slot", () => {
    const oldestAgo = 50 * 60_000;
    const budget = computeBudget([entry(oldestAgo), entry(1000), entry(2000)], LIMITS, NOW);
    expect(budget.retryAt).toBe(NOW - oldestAgo + HOUR_MS);
  });

  it("takes the later of the two windows when both are exhausted", () => {
    const entries = [
      entry(23 * HOUR_MS),
      entry(22 * HOUR_MS),
      entry(3000),
      entry(2000),
      entry(1000),
    ];
    const budget = computeBudget(entries, LIMITS, NOW);
    expect(budget.hourUsed).toBe(3);
    expect(budget.dayUsed).toBe(5);
    // The daily window is the binding one: it frees a slot only when the
    // 23h-old attempt ages out.
    expect(budget.retryAt).toBe(NOW - 23 * HOUR_MS + DAY_MS);
  });

  it("allows sending on an empty log", () => {
    const budget = computeBudget([], LIMITS, NOW);
    expect(budget).toMatchObject({ hourUsed: 0, dayUsed: 0, retryAt: null });
  });
});
