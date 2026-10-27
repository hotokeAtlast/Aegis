// Field-limit alignment (the residual 422 fix) — run with `bun test`.
// FIELD_LIMITS in server/src/planner-core.ts is the single source of truth:
// the client caps its inputs and payload with these numbers and the server
// schemas use the SAME numbers, so no text the client accepts can be
// rejected by the server. These tests pin the contract down.
import { describe, expect, test } from "bun:test";
import { FIELD_LIMITS, capText } from "../server/src/planner-core";

describe("field limits — wizard caps the pre-submission check flagged", () => {
  test("city, area preference, dietary notes and entertainment types have explicit caps", () => {
    expect(FIELD_LIMITS.city).toBe(120);
    expect(FIELD_LIMITS.areaPreference).toBe(300);
    expect(FIELD_LIMITS.dietaryNotes).toBe(2000);
    expect(FIELD_LIMITS.entertainmentTypes).toBe(600);
  });
  test("every wizard free-text field has a cap", () => {
    for (const key of ["plannerName", "title", "city", "eventDate", "areaPreference", "dietaryNotes", "entertainmentTypes"] as const) {
      expect(FIELD_LIMITS[key]).toBeGreaterThan(0);
    }
  });
  test("every customise / settings free-text field has a cap", () => {
    for (const key of ["manpowerRole", "manpowerLabel", "taskTitle", "taskOwner", "taskStatus", "budgetCategory", "budgetLabel", "budgetNote", "venueName", "menuCourse", "menuNotes", "regenSection", "regenInstruction", "apiKey", "modelName"] as const) {
      expect(FIELD_LIMITS[key]).toBeGreaterThan(0);
    }
  });
});

describe("capText — over-limit text is shortened to the shared limit, never a 422", () => {
  test("a 5,000-character dietary note is capped to the 2,000 limit the server accepts", () => {
    const capped = capText("x".repeat(5000), FIELD_LIMITS.dietaryNotes);
    expect(capped.length).toBe(FIELD_LIMITS.dietaryNotes);
  });
  test("text at or under the limit passes through unchanged", () => {
    expect(capText("Hyderabad", FIELD_LIMITS.city)).toBe("Hyderabad");
    expect(capText("y".repeat(120), FIELD_LIMITS.city)).toBe("y".repeat(120));
  });
  test("capping every wizard field keeps each one within its server-accepted limit", () => {
    const huge = "z".repeat(10000);
    const fields = ["plannerName", "title", "city", "areaPreference", "dietaryNotes", "entertainmentTypes"] as const;
    for (const f of fields) {
      expect(capText(huge, FIELD_LIMITS[f]).length).toBe(FIELD_LIMITS[f]);
    }
  });
});
