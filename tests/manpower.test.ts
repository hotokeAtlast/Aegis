// Manpower totals — run with `bun test` from the project root.
// The roster total is what the Manpower budget line is synced to in code,
// on both the client (People tab) and the server (updatePlan / restore).
import { describe, expect, test } from "bun:test";
import { manpowerTotal, type ManpowerLike } from "../server/src/planner-core";

const demoRoster: ManpowerLike[] = [
  { role: "server", label: "Servers", count: 15, costPerPersonInr: 800 },
  { role: "security", label: "Security", count: 3, costPerPersonInr: 1200 },
  { role: "coordinator", label: "Coordinator", count: 2, costPerPersonInr: 6000 },
];

describe("manpower totals", () => {
  test("roster total = Σ count × cost per person (demo roster = ₹27,600)", () => {
    // 15×800 + 3×1200 + 2×6000 = 12000 + 3600 + 12000
    expect(manpowerTotal(demoRoster)).toBe(27600);
  });
  test("raising the single coordinator to 2 adds exactly one person's cost", () => {
    const before: ManpowerLike[] = [{ role: "coordinator", label: "Coordinator", count: 1, costPerPersonInr: 6000 }];
    const after: ManpowerLike[] = [{ role: "coordinator", label: "Coordinator", count: 2, costPerPersonInr: 6000 }];
    expect(manpowerTotal(after) - manpowerTotal(before)).toBe(6000);
  });
  test("empty roster and zero-count roles total zero", () => {
    expect(manpowerTotal([])).toBe(0);
    expect(manpowerTotal([{ role: "valet", label: "Valet", count: 0, costPerPersonInr: 900 }])).toBe(0);
  });
});
