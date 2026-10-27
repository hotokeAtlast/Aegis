// planner-core.ts — pure, dependency-free planning maths shared by the
// client (client/src/App.tsx), the server actions, and the runnable test
// suite in tests/ (run with `bun test`). Keeping ONE implementation here is
// what makes the tests meaningful: they import the exact functions the app
// ships, not a copy. No secrets, no I/O, no model calls live in this file.

// --- Field limits: THE single source of truth for text caps -----------------
// Every wizard / customise free-text field has exactly one limit, used by:
//   • the client inputs (maxLength attributes),
//   • the client payload builder (capText before sending),
//   • the client validator (readable, field-specific message before sending),
//   • the server action schemas (the same numbers — never tighter),
//   • the template fallback (it builds from the same capped wizard payload).
// If a limit ever changes, change it here and nowhere else.
export const FIELD_LIMITS = {
  plannerName: 120,
  title: 200,
  city: 120,
  eventDate: 40,
  areaPreference: 300,
  dietaryNotes: 2000,
  entertainmentTypes: 600,
  manpowerRole: 80,
  manpowerLabel: 120,
  taskTitle: 200,
  taskOwner: 120,
  taskStatus: 40,
  budgetCategory: 40,
  budgetLabel: 120,
  budgetNote: 500,
  venueName: 200,
  menuCourse: 80,
  menuNotes: 1000,
  regenSection: 40,
  regenInstruction: 500,
  apiKey: 300,
  modelName: 80,
} as const;

/** Truncate a string to its field limit — the client applies this before
 *  sending and the server schemas accept up to the same limit, so a long
 *  optional text can never be rejected with an opaque 422. */
export function capText(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}

// --- Formatting (INR, en-IN) -------------------------------------------------
export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
export function formatNum(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

// --- Budget & food maths ------------------------------------------------------
/** Guests are always planned with a 10% buffer for food and capacity. */
export function plannedGuestsFor(guests: number): number {
  return Math.ceil(guests * 1.10);
}
export interface BudgetLineLike { category: string; label: string; plannedInr: number; note?: string }
export function totalOfLines(lines: BudgetLineLike[]): number {
  return lines.reduce((s, l) => s + (l.plannedInr || 0), 0);
}
export function remainingToMax(total: number, budgetMaxInr: number): number {
  return budgetMaxInr - total;
}
export function perGuestCost(total: number, guestCount: number): number {
  return guestCount ? Math.round(total / guestCount) : 0;
}
/** Veg / non-veg plate split. Non-veg takes the remainder so the two always
 *  total the planned guest count exactly (audit rule MIXED_FOOD_MISMATCH). */
export function vegNonVegPlates(foodType: string, plannedGuests: number, vegPercent: number): { vegPlates: number; nonVegPlates: number } {
  if (foodType === "veg") return { vegPlates: plannedGuests, nonVegPlates: 0 };
  if (foodType === "non-veg") return { vegPlates: 0, nonVegPlates: plannedGuests };
  const vegPlates = Math.ceil(plannedGuests * vegPercent / 100);
  return { vegPlates, nonVegPlates: plannedGuests - vegPlates };
}
export function foodCostInr(costPerPlateInr: number, plannedGuests: number): number {
  return costPerPlateInr * plannedGuests;
}

// --- Manpower ------------------------------------------------------------------
export interface ManpowerLike { role: string; label: string; count: number; costPerPersonInr: number }
export function manpowerTotal(roster: ManpowerLike[]): number {
  return roster.reduce((s, m) => s + m.count * m.costPerPersonInr, 0);
}

// --- Audit engine (all 12 rules) ------------------------------------------------
export const PER_GUEST_FLOORS: Record<string, number> = { wedding: 2000, birthday: 1200, corporate: 1500, other: 1500 };
export const CRITICAL_ROLES = ["coordinator", "photographer", "security"];
export type AuditSeverity = "blocker" | "warning" | "info";
export type AuditFlag = { id: string; severity: AuditSeverity; message: string; suggestedFix: string; resolved: boolean; fixLabel: string; canFix: boolean };
export type EditLine = BudgetLineLike;
export type EditManpower = ManpowerLike;
export type EditTask = { title: string; dueInDaysBefore: number; owner: string; status: string };

export function daysUntilEvent(eventDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${eventDate}T00:00:00`); if (isNaN(d.getTime())) return 999;
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function computeAuditFlags(input: {
  total: number; budgetMin: number; budgetMax: number; perGuest: number; eventType: string;
  plannedGuests: number; guestCount: number; selectedVenue: { name: string; capacity: number; parkingSpaces: number; costInr: number } | null;
  needsParking: boolean; expectedCars: number; foodLineInr: number; costPerPlate: number;
  desserts: boolean; menuCourses: string[]; manpower: EditManpower[]; tasks: EditTask[];
  eventDate: string; venueConfirmed: boolean; foodType: string; vegPercent: number; vegPlates: number; nonVegPlates: number;
  budgetLines: EditLine[];
}): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const largest = [...input.budgetLines].sort((a, b) => b.plannedInr - a.plannedInr)[0];
  const excess = input.total - input.budgetMax;
  flags.push({ id: "OVER_BUDGET", severity: "blocker", resolved: input.total <= input.budgetMax, canFix: input.total > input.budgetMax && !!largest, fixLabel: largest ? `Reduce ${largest.label} by ${formatINR(Math.max(0, excess))}` : "Reduce largest category", message: input.total > input.budgetMax ? `Total ${formatINR(input.total)} exceeds maximum ${formatINR(input.budgetMax)} by ${formatINR(excess)}. Largest category is ${largest?.label ?? "—"} at ${formatINR(largest?.plannedInr ?? 0)}.` : `Total ${formatINR(input.total)} is inside maximum ${formatINR(input.budgetMax)}.` , suggestedFix: largest ? `Reduce the largest reducible category (${largest.label}) by at least ${formatINR(Math.max(0, excess))}, or explicitly raise the maximum in Budget.` : "Reduce a category or raise the maximum." });
  const farBelowThreshold = Math.floor(input.budgetMin * 0.9);
  flags.push({ id: "UNDER_BUDGET_MIN", severity: "warning", resolved: input.total >= farBelowThreshold, canFix: input.total < farBelowThreshold, fixLabel: "Top up Misc / Decor to reach minimum", message: input.total < farBelowThreshold ? `Total ${formatINR(input.total)} is far below minimum ${formatINR(input.budgetMin)} (below 90% of minimum, ${formatINR(farBelowThreshold)}). A category may be missing.` : `Total ${formatINR(input.total)} is not far below minimum ${formatINR(input.budgetMin)}.` , suggestedFix: "Add the shortfall to Misc / Decor — it usually means transport, decor or misc was missed." });
  const venue = input.selectedVenue;
  flags.push({ id: "VENUE_TOO_SMALL", severity: "blocker", resolved: !!venue && venue.capacity >= input.plannedGuests, canFix: true, fixLabel: "Switch to a larger venue that fits", message: !venue ? "No venue is selected yet, so capacity cannot be verified for guests + buffer." : venue.capacity < input.plannedGuests ? `${venue.name} holds ${formatNum(venue.capacity)}, but you need ${formatNum(input.plannedGuests)} (guests + 10% buffer).` : `${venue.name} holds ${formatNum(venue.capacity)}, which fits ${formatNum(input.plannedGuests)} needed.` , suggestedFix: "Switch to the smallest venue that fits guests + buffer — totals and this flag recalculate instantly." });
  flags.push({ id: "PARKING_SHORTFALL", severity: "warning", resolved: !input.needsParking || (!!venue && venue.parkingSpaces >= input.expectedCars), canFix: true, fixLabel: "Switch to a venue with enough parking", message: !input.needsParking ? "Parking was not requested for this event." : !venue ? "No venue selected, so parking cannot be verified." : venue.parkingSpaces < input.expectedCars ? `${venue.name} has ${formatNum(venue.parkingSpaces)} parking spaces, but ${formatNum(input.expectedCars)} cars are expected.` : `${venue.name} has ${formatNum(venue.parkingSpaces)} spaces for ${formatNum(input.expectedCars)} expected cars.` , suggestedFix: "Switch to a venue with at least the expected number of parking spaces, if one exists." });
  const impliedPlates = input.costPerPlate > 0 ? Math.floor(input.foodLineInr / input.costPerPlate) : 0;
  flags.push({ id: "FOOD_SHORTFALL", severity: "warning", resolved: impliedPlates >= input.plannedGuests, canFix: input.costPerPlate > 0, fixLabel: `Add buffer — cover ${formatNum(input.plannedGuests)} plates`, message: impliedPlates >= input.plannedGuests ? `Food line ${formatINR(input.foodLineInr)} covers ${formatNum(impliedPlates)} plates at ${formatINR(input.costPerPlate)} — includes the 10% buffer (${formatNum(input.plannedGuests)} planned).` : `Food line ${formatINR(input.foodLineInr)} covers only ${formatNum(impliedPlates)} plates at ${formatINR(input.costPerPlate)}, but ${formatNum(input.plannedGuests)} are planned (guests + 10% buffer). It looks based on guests without the buffer.` , suggestedFix: `Set the food line to cost per plate × planned guests = ${formatINR(input.costPerPlate * input.plannedGuests)}.` });
  const floor = PER_GUEST_FLOORS[input.eventType] ?? 1500;
  flags.push({ id: "PER_GUEST_TOO_LOW", severity: "warning", resolved: input.perGuest >= floor, canFix: true, fixLabel: `Top up to ${formatINR(floor)} per guest floor`, message: input.perGuest >= floor ? `Per-guest cost ${formatINR(input.perGuest)} meets the ${formatINR(floor)} floor for a ${input.eventType}.` : `Per-guest cost ${formatINR(input.perGuest)} is below the ${formatINR(floor)} floor configured for a ${input.eventType}.` , suggestedFix: `Add ${formatINR(Math.max(0, floor * input.guestCount - input.total))} across categories to reach the floor — only if it stays inside your maximum; otherwise raise the maximum first.` });
  const hasDessert = input.menuCourses.some(c => c.toLowerCase().includes("dessert"));
  flags.push({ id: "MISSING_DESSERT_CHOICE", severity: "warning", resolved: !input.desserts || hasDessert, canFix: input.desserts && !hasDessert, fixLabel: "Add Dessert course to menu", message: !input.desserts ? "Desserts were not requested." : hasDessert ? "Desserts requested and a Dessert course is in the menu builder." : "Desserts were requested, but there is no Dessert course in the menu builder and no dessert line in the budget." , suggestedFix: "Add a Dessert course in the Food menu builder — the flag rechecks the menu after saving." });
  const servers = input.manpower.find(m => m.role === "server")?.count ?? 0;
  const security = input.manpower.find(m => m.role === "security")?.count ?? 0;
  const reqServers = Math.ceil(input.guestCount / 20);
  const reqSecurity = Math.max(2, Math.ceil(input.guestCount / 100));
  const hasSecurityRole = !!input.manpower.find(m => m.role === "security");
  const staffLow = servers < reqServers || (hasSecurityRole && security < reqSecurity);
  flags.push({ id: "STAFF_RATIO_LOW", severity: "warning", resolved: !staffLow, canFix: staffLow, fixLabel: `Raise staff to ratio (servers ${reqServers}, security ${reqSecurity})`, message: staffLow ? `Staff ratio is low: ${servers} servers (need ${reqServers} at 1 per 20 guests)${hasSecurityRole ? `, ${security} security (need ${reqSecurity})` : ""}.` : `Staff ratio passes: ${servers} servers for ${formatNum(input.guestCount)} guests (1 per 20 = ${reqServers} needed)${hasSecurityRole ? `, ${security} security (need ${reqSecurity})` : ""}.` , suggestedFix: "Increase servers to 1 per 20 guests and security to the configured ratio in People — manpower cost and budget line recalculate in code." });
  const noOwner = input.tasks.filter(t => !t.owner || !t.owner.trim());
  flags.push({ id: "NO_TIMELINE_OWNER", severity: "info", resolved: noOwner.length === 0, canFix: noOwner.length > 0, fixLabel: "Assign Coordinator to ownerless tasks", message: noOwner.length === 0 ? "Every timeline task has an owner." : `${noOwner.length} timeline task(s) have no owner: ${noOwner.map(t => t.title).join(", ")}.` , suggestedFix: "Assign an owner (default Coordinator) to each ownerless task in Timeline." });
  const days = daysUntilEvent(input.eventDate);
  flags.push({ id: "DATE_TOO_SOON", severity: "blocker", resolved: !(days <= 14 && !input.venueConfirmed), canFix: days <= 14 && !input.venueConfirmed && !!venue, fixLabel: "Confirm the selected venue now", message: days > 14 ? `Event is in ${days} days — not within the 14-day risk window.` : input.venueConfirmed ? `Event is in ${days} day(s) and the venue is confirmed.` : `Event is in ${days} day(s) (within 14 days) and the venue is not confirmed yet.` , suggestedFix: "Confirm the selected venue in the Venue tab — this flag only resolves when venueConfirmed is true after recalculation." });
  const platesSumOk = input.vegPlates + input.nonVegPlates === input.plannedGuests;
  const mixedOk = input.foodType !== "mixed" || (input.vegPercent >= 0 && input.vegPercent <= 100 && platesSumOk);
  flags.push({ id: "MIXED_FOOD_MISMATCH", severity: "blocker", resolved: mixedOk, canFix: !mixedOk, fixLabel: "Recalculate veg / non-veg plates to total 100%", message: input.foodType !== "mixed" ? `Food type is ${input.foodType} — no mixed split to check.` : mixedOk ? `Mixed split is ${input.vegPercent}% veg / ${100 - input.vegPercent}% non-veg = 100%, and plates ${formatNum(input.vegPlates)} + ${formatNum(input.nonVegPlates)} = ${formatNum(input.plannedGuests)} planned.` : `Mixed split does not total 100% or plates ${formatNum(input.vegPlates)} + ${formatNum(input.nonVegPlates)} do not equal ${formatNum(input.plannedGuests)} planned.` , suggestedFix: "Recalculate plates in code: veg = ceil(planned × veg%), non-veg = planned − veg, so they always total the planned count." });
  const singlePoint = input.manpower.filter(m => CRITICAL_ROLES.includes(m.role) && m.count === 1);
  flags.push({ id: "SINGLE_POINT_FAILURE", severity: "info", resolved: singlePoint.length === 0, canFix: singlePoint.length > 0, fixLabel: "Raise single-person critical roles to 2", message: singlePoint.length === 0 ? "No critical role depends on a single person." : `Critical role(s) with only 1 person: ${singlePoint.map(m => m.label).join(", ")}. If that person is unavailable, the event has no backup.` , suggestedFix: "Raise each single-person critical role (coordinator, photographer, security) to at least 2 in People." });
  return flags;
}

/** Health = 100 − 25 per unresolved blocker − 10 per warning − 2 per info, floor 0. */
export function healthFromFlags(flags: AuditFlag[]): number {
  const unresolved = flags.filter(f => !f.resolved);
  const score = 100 - unresolved.filter(f => f.severity === "blocker").length * 25 - unresolved.filter(f => f.severity === "warning").length * 10 - unresolved.filter(f => f.severity === "info").length * 2;
  return Math.max(0, score);
}

export function venueFitScore(v: { capacity: number; parkingSpaces: number; costInr: number }, planned: number, needsParking: boolean, expectedCars: number, venueBudgetInr: number): number {
  const capScore = v.capacity >= planned ? 50 : Math.round(50 * (planned ? v.capacity / planned : 0));
  const parkScore = !needsParking ? 30 : v.parkingSpaces >= expectedCars ? 30 : Math.round(30 * (expectedCars ? v.parkingSpaces / expectedCars : 0));
  const costScore = v.costInr <= venueBudgetInr ? 20 : v.costInr <= venueBudgetInr * 1.3 ? 12 : 6;
  return Math.max(0, Math.min(100, capScore + parkScore + costScore));
}

// --- Plan version snapshots: metrics, compare, restore recalculation ------------
export interface VenueLike { name: string; capacity: number; parkingSpaces: number; costInr: number; kind?: string }
export interface SnapshotLike {
  budgetLines: EditLine[];
  costPerPlateInr: number;
  venueOptions: VenueLike[];
  menu: { courses: string[]; notes?: string; costPerPlateInr?: number };
  tasks: EditTask[];
  manpower: EditManpower[];
  selectedVenueName: string | null;
  venueConfirmed: boolean;
  budgetMinInr: number;
  budgetMaxInr: number;
  desserts: boolean;
  fruits: boolean;
  dryFruits: boolean;
  guestCount: number;
  eventType: string;
  eventDate: string;
  foodType: string;
  vegPercent: number;
  needsParking: boolean;
  expectedCars: number;
}

export interface SnapshotMetrics {
  total: number; perGuest: number; plannedGuests: number; health: number;
  flags: AuditFlag[]; selectedVenue: VenueLike | null; vegPlates: number; nonVegPlates: number;
}

/** Recalculate total / per-guest / health for ANY snapshot from its own data.
 *  Restore uses exactly this: a restored snapshot is re-audited, never trusted,
 *  so restoring a bad version re-flags it instead of hiding the problem. */
export function snapshotMetrics(snap: SnapshotLike, fallback?: Partial<SnapshotLike>): SnapshotMetrics {
  const s: SnapshotLike = { ...snap, guestCount: snap.guestCount || fallback?.guestCount || 0, eventType: snap.eventType || fallback?.eventType || "other", eventDate: snap.eventDate || fallback?.eventDate || "", budgetMinInr: snap.budgetMinInr || fallback?.budgetMinInr || 0, budgetMaxInr: snap.budgetMaxInr || fallback?.budgetMaxInr || 0 };
  const lines = s.budgetLines ?? [];
  const total = totalOfLines(lines);
  const guests = s.guestCount;
  const planned = plannedGuestsFor(guests);
  const perG = perGuestCost(total, guests);
  const selVenue = (s.venueOptions ?? []).find(v => v.name === s.selectedVenueName) ?? (s.venueOptions ?? [])[0] ?? null;
  const { vegPlates, nonVegPlates } = vegNonVegPlates(s.foodType, planned, s.vegPercent);
  const flags = computeAuditFlags({
    total, budgetMin: s.budgetMinInr, budgetMax: s.budgetMaxInr, perGuest: perG, eventType: s.eventType,
    plannedGuests: planned, guestCount: guests, selectedVenue: selVenue, needsParking: s.needsParking, expectedCars: s.expectedCars,
    foodLineInr: lines.find(l => l.category === "food")?.plannedInr ?? 0, costPerPlate: s.costPerPlateInr,
    desserts: s.desserts, menuCourses: s.menu?.courses ?? [], manpower: s.manpower ?? [],
    tasks: (s.tasks ?? []).map(t => ({ title: t.title, dueInDaysBefore: t.dueInDaysBefore, owner: t.owner ?? "", status: t.status ?? "todo" })),
    eventDate: s.eventDate, venueConfirmed: s.venueConfirmed, foodType: s.foodType, vegPercent: s.vegPercent,
    vegPlates, nonVegPlates, budgetLines: lines,
  });
  return { total, perGuest: perG, plannedGuests: planned, health: healthFromFlags(flags), flags, selectedVenue: selVenue, vegPlates, nonVegPlates };
}

export interface SnapshotComparison {
  totalA: number; totalB: number; totalDiff: number;
  perGuestA: number; perGuestB: number; healthA: number; healthB: number;
  lineDiffs: { category: string; label: string; a: number; b: number; diff: number }[];
  manpowerDiffs: { role: string; label: string; aCount: number; bCount: number; changed: boolean }[];
  venueChanged: boolean;
}

/** Side-by-side comparison of two snapshots, all figures recalculated. */
export function compareSnapshots(a: SnapshotLike, b: SnapshotLike, fallback?: Partial<SnapshotLike>): SnapshotComparison {
  const ma = snapshotMetrics(a, fallback);
  const mb = snapshotMetrics(b, fallback);
  const cats = Array.from(new Set([...(a.budgetLines ?? []).map(l => l.category), ...(b.budgetLines ?? []).map(l => l.category)]));
  const lineDiffs = cats.map(cat => {
    const la = a.budgetLines.find(l => l.category === cat);
    const lb = b.budgetLines.find(l => l.category === cat);
    return { category: cat, label: lb?.label ?? la?.label ?? cat, a: la?.plannedInr ?? 0, b: lb?.plannedInr ?? 0, diff: (lb?.plannedInr ?? 0) - (la?.plannedInr ?? 0) };
  });
  const roles = Array.from(new Set([...(a.manpower ?? []).map(m => m.role), ...(b.manpower ?? []).map(m => m.role)]));
  const manpowerDiffs = roles.map(role => {
    const ra = a.manpower.find(m => m.role === role);
    const rb = b.manpower.find(m => m.role === role);
    return { role, label: rb?.label ?? ra?.label ?? role, aCount: ra?.count ?? 0, bCount: rb?.count ?? 0, changed: (ra?.count ?? 0) !== (rb?.count ?? 0) || (ra?.costPerPersonInr ?? 0) !== (rb?.costPerPersonInr ?? 0) };
  });
  return {
    totalA: ma.total, totalB: mb.total, totalDiff: mb.total - ma.total,
    perGuestA: ma.perGuest, perGuestB: mb.perGuest, healthA: ma.health, healthB: mb.health,
    lineDiffs, manpowerDiffs, venueChanged: ma.selectedVenue?.name !== mb.selectedVenue?.name,
  };
}

// --- Accessibility: WCAG contrast ----------------------------------------------
/** WCAG 2.x contrast ratio between two #RRGGBB colours (1–21). Used by the
 *  test suite to prove every theme surface pair passes 4.5:1 in BOTH the
 *  light and dark schemes — dark text on light tints, light text on dark
 *  tints, never white on white. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string): number => {
    const h = hex.replace("#", "");
    const channels = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = channels.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
  };
  const la = lum(hexA); const lb = lum(hexB);
  const lighter = Math.max(la, lb); const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
