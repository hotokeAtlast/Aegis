// Budget maths — run with `bun test` from the project root.
// Imports the SAME pure functions the app ships (server/src/planner-core.ts),
// so a failure here is a real regression in the budget engine, not a copy.
import { describe, expect, test } from "bun:test";
import { formatINR, perGuestCost, remainingToMax, totalOfLines, type BudgetLineLike } from "../server/src/planner-core";

// The verified demo case: 300-guest Hyderabad wedding after audit fixes.
const demoLines: BudgetLineLike[] = [
  { category: "venue", label: "Venue", plannedInr: 504000 },
  { category: "food", label: "Food & Catering", plannedInr: 561000 },
  { category: "decor", label: "Decor", plannedInr: 240000 },
  { category: "entertainment", label: "Entertainment", plannedInr: 128000 },
  { category: "photography", label: "Photography", plannedInr: 80000 },
  { category: "manpower", label: "Manpower", plannedInr: 27600 },
  { category: "misc", label: "Misc / Transport", plannedInr: 32000 },
];

describe("budget maths", () => {
  test("total is the sum of all budget lines", () => {
    expect(totalOfLines(demoLines)).toBe(1572600);
  });
  test("empty budget totals zero", () => {
    expect(totalOfLines([])).toBe(0);
  });
  test("remaining to maximum = max − total (demo: ₹4,27,400 left)", () => {
    expect(remainingToMax(totalOfLines(demoLines), 2000000)).toBe(427400);
  });
  test("remaining goes negative when over budget (never hidden)", () => {
    expect(remainingToMax(2100000, 2000000)).toBe(-100000);
  });
  test("per-guest cost = total ÷ guests, rounded (demo: ₹5,242)", () => {
    expect(perGuestCost(1572600, 300)).toBe(5242);
  });
  test("per-guest cost with zero guests is 0, never NaN/Infinity", () => {
    expect(perGuestCost(1572600, 0)).toBe(0);
  });
  test("money is formatted en-IN with Indian digit grouping", () => {
    expect(formatINR(1572600)).toBe("₹15,72,600");
    expect(formatINR(2000000)).toBe("₹20,00,000");
    expect(formatINR(5242)).toBe("₹5,242");
  });
});
