// types.ts — shared client types derived from the server action contract.
// The API response types come straight from server/src/actions.ts (via
// client/src/api.ts), so the client can never drift from the server shape.
import type { api, ApiResponse } from "./api";
import type { EditLine, EditManpower, EditTask } from "../../server/src/planner-core";

export type EventT = ApiResponse<typeof api, "getEvent">["event"];
export type EventNonNull = NonNullable<EventT>;
export type VersionT = ApiResponse<typeof api, "listVersions">["versions"][number];

// Payload for saving customise edits (Budget / Venue / Food / People /
// Timeline / Audit fixes). Built by PlanScreen and sent to updatePlan.
export type SavePayload = {
  budgetLines: EditLine[];
  costPerPlateInr: number;
  desserts: boolean;
  fruits: boolean;
  dryFruits: boolean;
  manpower: EditManpower[];
  tasks: EditTask[];
  menuCourses: string[];
  selectedVenueName: string | null;
  venueConfirmed: boolean;
  budgetMinInr: number;
  budgetMaxInr: number;
};
