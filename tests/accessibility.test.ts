// Accessibility — theme contrast, run with `bun test` from the project root.
// Every notice / highlight surface in client/src/theme.css pairs a background
// with a foreground. These tests prove each pair passes the WCAG AA 4.5:1
// ratio for normal text in BOTH colour schemes — dark text on light tints
// in light mode, light text on dark tints in dark mode, never white on
// white. If a theme token changes, update the pair here and in theme.css.
import { describe, expect, test } from "bun:test";
import { contrastRatio } from "../server/src/planner-core";

const AA_NORMAL_TEXT = 4.5;

const lightPairs: [string, string, string][] = [
  // [surface name, background, foreground] — light scheme tokens
  ["page background", "#FFFBF0", "#1C1917"],
  ["page background / dim text", "#FFFBF0", "#57534E"],
  ["surface", "#ffffff", "#1C1917"],
  ["info notice (message boxes)", "#EFF6FF", "#1E3A5F"],
  ["success notice", "#F0FDF4", "#14532D"],
  ["warning notice", "#FFFBEB", "#78350F"],
  ["danger notice", "#FEF2F2", "#7F1D1D"],
  ["highlight box (Live per-guest range)", "#FFFBEB", "#1C1917"],
  ["highlight box sub-text", "#FFFBEB", "#57534E"],
];

const darkPairs: [string, string, string][] = [
  ["page background", "#121110", "#F5F0E6"],
  ["page background / dim text", "#121110", "#C9C2B8"],
  ["surface", "#1E1C1A", "#F5F0E6"],
  ["info notice (message boxes)", "#16283D", "#DBEAFE"],
  ["success notice", "#122E1E", "#BBF7D0"],
  ["warning notice", "#33240A", "#FDE68A"],
  ["danger notice", "#331515", "#FECACA"],
  ["highlight box (Live per-guest range)", "#2E2410", "#F5F0E6"],
  ["highlight box sub-text", "#2E2410", "#D6CDBB"],
];

describe("accessibility — WCAG AA contrast in the light scheme", () => {
  for (const [name, bg, fg] of lightPairs) {
    test(`${name}: ${fg} on ${bg} is at least ${AA_NORMAL_TEXT}:1`, () => {
      expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  }
});

describe("accessibility — WCAG AA contrast in the dark scheme", () => {
  for (const [name, bg, fg] of darkPairs) {
    test(`${name}: ${fg} on ${bg} is at least ${AA_NORMAL_TEXT}:1`, () => {
      expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  }
});

describe("accessibility — the reported white-on-white failure mode", () => {
  test("near-white text on a pale tint (the old bug) is correctly measured as failing", () => {
    // #F5F0E6 text on the light highlight tint #FFFBEB was the Milestone 5 bug.
    expect(contrastRatio("#FFFBEB", "#F5F0E6")).toBeLessThan(AA_NORMAL_TEXT);
  });
  test("white on white is 1:1 — the floor every surface must stay above", () => {
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });
});
