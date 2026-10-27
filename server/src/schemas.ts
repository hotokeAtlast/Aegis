// schemas.ts — zod schemas shared by the server actions.
// Moved verbatim from server/src/actions.ts (structure-only refactor):
// every request/response shape, cap and default is unchanged, so the
// client contract and the 422 hardening below behave exactly as before.

import { z } from "@hatch/space-sdk";
import { FIELD_LIMITS } from "./planner-core";
import { DEFAULT_MODEL } from "./settings-store";

// --- 422 hardening (reported bug: "action createEventAI failed: 422") ---
// The wizard's number inputs freely produce non-integers (typed decimals,
// cleared fields -> NaN, which JSON sends as null), and its text inputs had
// no length limits while the request schema capped them tightly. Strict
// .int()/.max() request validation therefore rejected realistic user input
// BEFORE the handler ran — so the template fallback never executed and the
// user saw only an opaque 422. Fix: numeric inputs are accepted loosely and
// rounded/clamped in code, text limits are generous, and rowToEvent
// sanitises every stored array so a response can never fail validation.
export const intLike = z.union([z.number().finite(), z.null()]).transform((v) => Math.max(0, Math.round(v ?? 0)));
export const signedIntLike = z.union([z.number().finite(), z.null()]).transform((v) => Math.round(v ?? 0));

export const budgetLineSchema = z.object({
  category: z.string(),
  label: z.string(),
  plannedInr: z.number().min(0),
  note: z.string().optional().default(""),
});
export const manpowerSchema = z.object({
  role: z.string(),
  label: z.string(),
  count: z.number().min(0),
  costPerPersonInr: z.number().min(0),
});
export const manpowerInputSchema = z.object({
  role: z.string().min(1).max(FIELD_LIMITS.manpowerRole),
  label: z.string().max(FIELD_LIMITS.manpowerLabel).default(""),
  count: intLike,
  costPerPersonInr: intLike,
});
export const venueOptionSchema = z.object({
  name: z.string(),
  capacity: z.number().min(0),
  parkingSpaces: z.number().min(0),
  costInr: z.number().min(0),
  kind: z.string().optional().default(""),
});
export const menuSchema = z.object({
  courses: z.array(z.string()).default([]),
  notes: z.string().optional().default(""),
  costPerPlateInr: z.number().min(0).optional().default(0),
});
export const taskSchema = z.object({
  title: z.string(),
  dueInDaysBefore: z.number(),
  owner: z.string().optional().default("Coordinator"),
  status: z.string().optional().default("todo"),
});
export const taskInputSchema = z.object({
  title: z.string().min(1).max(FIELD_LIMITS.taskTitle),
  dueInDaysBefore: signedIntLike,
  owner: z.string().max(FIELD_LIMITS.taskOwner).optional().default("Coordinator"),
  status: z.string().max(FIELD_LIMITS.taskStatus).optional().default("todo"),
});

// Input-only schemas for updatePlan. The shared budgetLineSchema / menuSchema
// above are ALSO used for responses and snapshot parsing, so they stay
// uncapped (a stored AI note must never fail a read); the request side caps
// every free-text field at the shared FIELD_LIMITS the client uses.
export const budgetLineInputSchema = z.object({
  category: z.string().max(FIELD_LIMITS.budgetCategory),
  label: z.string().max(FIELD_LIMITS.budgetLabel),
  plannedInr: z.number().min(0),
  note: z.string().max(FIELD_LIMITS.budgetNote).optional().default(""),
});
export const menuInputSchema = z.object({
  courses: z.array(z.string().max(FIELD_LIMITS.menuCourse)).default([]),
  notes: z.string().max(FIELD_LIMITS.menuNotes).optional().default(""),
  costPerPlateInr: z.number().min(0).optional().default(0),
});

export const eventOutSchema = z.object({
  id: z.number(),
  plannerName: z.string(),
  title: z.string(),
  eventType: z.string(),
  eventDate: z.string(),
  city: z.string(),
  guestCount: z.number(),
  budgetMinInr: z.number(),
  budgetMaxInr: z.number(),
  venuePref: z.string(),
  needsParking: z.boolean(),
  expectedCars: z.number(),
  areaPreference: z.string().nullable(),
  foodType: z.string(),
  vegPercent: z.number(),
  desserts: z.boolean(),
  fruits: z.boolean(),
  dryFruits: z.boolean(),
  dietaryNotes: z.string().nullable(),
  entertainmentTypes: z.string(),
  entertainmentHours: z.number(),
  kidsActivities: z.boolean(),
  decorLevel: z.string(),
  manpower: z.array(manpowerSchema),
  budgetLines: z.array(budgetLineSchema),
  costPerPlateInr: z.number(),
  planSource: z.string(),
  planVersion: z.number(),
  venueOptions: z.array(venueOptionSchema),
  menu: menuSchema,
  tasks: z.array(taskSchema),
  risks: z.array(z.string()),
  aiNotes: z.array(z.string()),
  aiModel: z.string(),
  generationMessage: z.string().nullable(),
  selectedVenueName: z.string().nullable(),
  venueConfirmed: z.boolean(),
  createdAt: z.string(),
});

export const snapshotSchema = z.object({
  budgetLines: z.array(budgetLineSchema).default([]),
  costPerPlateInr: z.number().default(0),
  venueOptions: z.array(venueOptionSchema).default([]),
  menu: menuSchema.default({ courses: [], notes: "", costPerPlateInr: 0 }),
  tasks: z.array(taskSchema).default([]),
  manpower: z.array(manpowerSchema).default([]),
  risks: z.array(z.string()).default([]),
  aiNotes: z.array(z.string()).default([]),
  aiModel: z.string().default(DEFAULT_MODEL),
  planSource: z.string().default("template"),
  selectedVenueName: z.string().nullable().default(null),
  venueConfirmed: z.boolean().default(false),
  budgetMinInr: z.number().default(0),
  budgetMaxInr: z.number().default(0),
  desserts: z.boolean().default(false),
  fruits: z.boolean().default(false),
  dryFruits: z.boolean().default(false),
  generationMessage: z.string().nullable().default(null),
  guestCount: z.number().default(0),
  eventType: z.string().default("other"),
  eventDate: z.string().default(""),
  foodType: z.string().default("veg"),
  vegPercent: z.number().default(100),
  needsParking: z.boolean().default(false),
  expectedCars: z.number().default(0),
});
export type SnapshotData = z.infer<typeof snapshotSchema>;

export const versionOutSchema = z.object({
  id: z.number(),
  eventId: z.number(),
  versionNumber: z.number(),
  source: z.string(),
  label: z.string(),
  totalInr: z.number(),
  perGuestInr: z.number(),
  healthScore: z.number(),
  snapshot: snapshotSchema,
  createdAt: z.string(),
});
