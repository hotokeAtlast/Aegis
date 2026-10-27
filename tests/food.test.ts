// Food maths — run with `bun test` from the project root.
// Covers the 10% guest buffer and the veg / non-veg split that must always
// total the planned guest count (audit rule MIXED_FOOD_MISMATCH depends on it).
import { describe, expect, test } from "bun:test";
import { foodCostInr, plannedGuestsFor, vegNonVegPlates } from "../server/src/planner-core";

describe("food maths — 10% guest buffer", () => {
  test("300 guests are planned as 330 for food", () => {
    expect(plannedGuestsFor(300)).toBe(330);
  });
  test("buffer rounds UP so food never falls short (301 guests → 332)", () => {
    expect(plannedGuestsFor(301)).toBe(332);
    expect(plannedGuestsFor(10)).toBe(11);
  });
  test("food cost = cost per plate × planned guests (₹1,700 × 330 = ₹5,61,000)", () => {
    expect(foodCostInr(1700, plannedGuestsFor(300))).toBe(561000);
  });
});

describe("food maths — veg / non-veg split totals the planned count", () => {
  test("mixed 60% veg on 330 planned = 198 veg + 132 non-veg", () => {
    const { vegPlates, nonVegPlates } = vegNonVegPlates("mixed", 330, 60);
    expect(vegPlates).toBe(198);
    expect(nonVegPlates).toBe(132);
    expect(vegPlates + nonVegPlates).toBe(330);
  });
  test("split totals planned guests for every percentage, even awkward ones", () => {
    for (const pct of [0, 1, 33, 50, 67, 99, 100]) {
      const { vegPlates, nonVegPlates } = vegNonVegPlates("mixed", 331, pct);
      expect(vegPlates + nonVegPlates).toBe(331);
      expect(vegPlates).toBeGreaterThanOrEqual(0);
      expect(nonVegPlates).toBeGreaterThanOrEqual(0);
    }
  });
  test("pure veg plans all plates veg; pure non-veg plans all non-veg", () => {
    expect(vegNonVegPlates("veg", 330, 100)).toEqual({ vegPlates: 330, nonVegPlates: 0 });
    expect(vegNonVegPlates("non-veg", 330, 0)).toEqual({ vegPlates: 0, nonVegPlates: 330 });
  });
});
