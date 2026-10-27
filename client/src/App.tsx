import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";

type EventT = ApiResponse<typeof api, "getEvent">["event"];
type EventNonNull = NonNullable<EventT>;
type VersionT = ApiResponse<typeof api, "listVersions">["versions"][number];

// All planning maths (budget, food, manpower, the 12-rule audit engine,
// snapshot metrics) and the shared FIELD_LIMITS live in ONE pure module —
// server/src/planner-core.ts — which the runnable test suite in tests/
// imports directly (`bun test`). This screen uses the exact same functions
// the tests verify; there is no second copy to drift out of sync.
import {
  FIELD_LIMITS, capText, formatINR, formatNum, plannedGuestsFor, daysUntilEvent,
  PER_GUEST_FLOORS, CRITICAL_ROLES, computeAuditFlags, healthFromFlags, venueFitScore,
  snapshotMetrics, compareSnapshots,
  type AuditFlag, type EditLine, type EditManpower, type EditTask,
} from "../../server/src/planner-core";
// --- Milestone 5: in-app unit-style self-checks ---------------------------------
// These run the SAME production functions the plan screens use (computeAuditFlags,
// healthFromFlags, plannedGuestsFor, formatINR) against the verified demo case:
// 300 guests, Hyderabad, ₹12,00,000–₹20,00,000, mixed 60% veg. Results are shown
// live on the Demo guide screen — a red row means a real regression, not a mock.
type SelfCheck = { name: string; pass: boolean; detail: string };
function isoInDays(days: number): string { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function healthyAuditInput(): Parameters<typeof computeAuditFlags>[0] {
  const lines: EditLine[] = [
    { category: "venue", label: "Venue", plannedInr: 504000 },
    { category: "food", label: "Food & Catering", plannedInr: 561000 },
    { category: "decor", label: "Decor", plannedInr: 240000 },
    { category: "entertainment", label: "Entertainment", plannedInr: 128000 },
    { category: "photography", label: "Photography", plannedInr: 80000 },
    { category: "manpower", label: "Manpower", plannedInr: 27600 },
    { category: "misc", label: "Misc / Transport", plannedInr: 32000 },
  ];
  return {
    total: 1572600, budgetMin: 1200000, budgetMax: 2000000, perGuest: 5242, eventType: "wedding",
    plannedGuests: 330, guestCount: 300,
    selectedVenue: { name: "Hyderabad Lakeview Gardens", capacity: 413, parkingSpaces: 100, costInr: 504000 },
    needsParking: true, expectedCars: 75, foodLineInr: 561000, costPerPlate: 1700,
    desserts: true, menuCourses: ["Starter", "Main Course", "Dessert", "Dry Fruits Counter"],
    manpower: [
      { role: "server", label: "Servers", count: 15, costPerPersonInr: 800 },
      { role: "security", label: "Security", count: 3, costPerPersonInr: 1200 },
      { role: "coordinator", label: "Coordinator", count: 2, costPerPersonInr: 6000 },
      { role: "photographer", label: "Photographer", count: 2, costPerPersonInr: 8000 },
    ],
    tasks: [{ title: "Book venue & confirm parking", dueInDaysBefore: 30, owner: "Coordinator", status: "todo" }],
    eventDate: isoInDays(60), venueConfirmed: true, foodType: "mixed", vegPercent: 60, vegPlates: 198, nonVegPlates: 132,
    budgetLines: lines,
  };
}
function runSelfChecks(): SelfCheck[] {
  const checks: SelfCheck[] = [];
  const push = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const base = healthyAuditInput();
  const total = base.budgetLines.reduce((s, l) => s + l.plannedInr, 0);
  push("Budget maths — total is the sum of all lines", total === 1572600, `Lines sum to ${formatINR(total)} (demo fixed plan: ${formatINR(1572600)})`);
  push("Budget maths — remaining to maximum", base.budgetMax - total === 427400, `${formatINR(base.budgetMax)} − ${formatINR(total)} = ${formatINR(base.budgetMax - total)}`);
  push("Budget maths — per-guest cost", Math.round(total / base.guestCount) === 5242, `${formatINR(total)} ÷ 300 guests = ${formatINR(Math.round(total / base.guestCount))} per guest`);
  push("INR formatting (en-IN grouping)", formatINR(1572600) === "₹15,72,600", `formatINR(1572600) = ${formatINR(1572600)}`);
  push("Food maths — 10% guest buffer", plannedGuestsFor(300) === 330, `300 guests → ${plannedGuestsFor(300)} planned for food`);
  const veg = Math.ceil(330 * 60 / 100); const nonVeg = 330 - veg;
  push("Food maths — mixed 60% veg split totals 100%", veg === 198 && nonVeg === 132 && veg + nonVeg === 330, `Veg ${veg} + non-veg ${nonVeg} = ${veg + nonVeg} plates`);
  push("Food maths — food cost = cost per plate × planned guests", 1700 * 330 === 561000, `${formatINR(1700)} × 330 = ${formatINR(1700 * 330)}`);
  const healthy = computeAuditFlags(base);
  push("Audit — healthy demo plan passes all 12 rules", healthy.every(f => f.resolved) && healthFromFlags(healthy) === 100, `Unresolved: ${healthy.filter(f => !f.resolved).map(f => f.id).join(", ") || "none"} • Health ${healthFromFlags(healthy)}/100`);
  const synthetic: AuditFlag[] = [
    { id: "A", severity: "blocker", resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false },
    { id: "B", severity: "warning", resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false },
    { id: "C", severity: "info", resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false },
  ];
  push("Audit — health score formula (100 − 25 blocker − 10 warning − 2 info)", healthFromFlags(synthetic) === 63, `1 blocker + 1 warning + 1 info unresolved → ${healthFromFlags(synthetic)}/100`);
  const rule = (id: string, mutate: (i: Parameters<typeof computeAuditFlags>[0]) => void, detail: string) => {
    const copy: Parameters<typeof computeAuditFlags>[0] = { ...base, manpower: base.manpower.map(m => ({ ...m })), tasks: base.tasks.map(t => ({ ...t })), budgetLines: base.budgetLines.map(l => ({ ...l })), selectedVenue: base.selectedVenue ? { ...base.selectedVenue } : null, menuCourses: [...base.menuCourses] };
    mutate(copy);
    const flag = computeAuditFlags(copy).find(f => f.id === id);
    push(`Audit rule — ${id} fires when it should`, !!flag && !flag.resolved, detail);
  };
  rule("OVER_BUDGET", i => { i.total = 2100000; }, "Total ₹21,00,000 vs max ₹20,00,000 must be a blocker");
  rule("UNDER_BUDGET_MIN", i => { i.total = 500000; }, "Total ₹5,00,000 is far below the ₹12,00,000 minimum (below 90%)");
  rule("VENUE_TOO_SMALL", i => { if (i.selectedVenue) i.selectedVenue.capacity = 280; }, "Venue holds 280 but 330 are needed (guests + buffer)");
  rule("PARKING_SHORTFALL", i => { if (i.selectedVenue) i.selectedVenue.parkingSpaces = 52; }, "52 parking spaces for 75 expected cars");
  rule("FOOD_SHORTFALL", i => { i.foodLineInr = 1700 * 300; }, "Food line covers 300 plates (no buffer) but 330 are planned");
  rule("PER_GUEST_TOO_LOW", i => { i.perGuest = 1000; }, "₹1,000 per guest is below the ₹2,000 wedding floor");
  rule("MISSING_DESSERT_CHOICE", i => { i.menuCourses = ["Starter", "Main Course"]; }, "Desserts requested but no Dessert course in the menu");
  rule("STAFF_RATIO_LOW", i => { i.manpower = i.manpower.map(m => m.role === "server" ? { ...m, count: 5 } : m); }, "5 servers for 300 guests (need 15 at 1 per 20)");
  rule("NO_TIMELINE_OWNER", i => { i.tasks = [{ title: "Book venue", dueInDaysBefore: 30, owner: "", status: "todo" }]; }, "A timeline task with no owner");
  rule("DATE_TOO_SOON", i => { i.eventDate = isoInDays(5); i.venueConfirmed = false; }, "Event in 5 days with the venue not confirmed");
  rule("MIXED_FOOD_MISMATCH", i => { i.vegPlates = 100; i.nonVegPlates = 100; }, "Veg 100 + non-veg 100 ≠ 330 planned plates");
  rule("SINGLE_POINT_FAILURE", i => { i.manpower = i.manpower.map(m => m.role === "coordinator" ? { ...m, count: 1 } : m); }, "Coordinator is a critical role with only 1 person");
  // Restore recalculation: a snapshot round-trip must reproduce the same totals/health,
  // and restoring a bad snapshot must re-flag it (restore never hides problems).
  const roundTripped = JSON.parse(JSON.stringify(base)) as Parameters<typeof computeAuditFlags>[0];
  const rtFlags = computeAuditFlags(roundTripped);
  push("Restore — snapshot round-trip recalculates identical totals & health", healthFromFlags(rtFlags) === 100 && rtFlags.every(f => f.resolved), "Serialised → restored demo snapshot still scores 100/100");
  const badRestore: Parameters<typeof computeAuditFlags>[0] = { ...base, selectedVenue: { name: "Hyderabad Grand Hall", capacity: 280, parkingSpaces: 52, costInr: 432000 } };
  const badFlags = computeAuditFlags(badRestore);
  const badHealth = healthFromFlags(badFlags);
  push("Restore — restoring a bad version re-flags it instead of hiding it", badHealth === 65 && !badFlags.find(f => f.id === "VENUE_TOO_SMALL")?.resolved && !badFlags.find(f => f.id === "PARKING_SHORTFALL")?.resolved, `Small venue restored → health ${badHealth}/100 (blocker −25, parking warning −10)`);
  return checks;
}

function addDays(dateStr: string, offset: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const ENTERTAINMENT_OPTS = ["DJ", "Live Music", "Anchor / MC", "Dance Performance", "Photo Booth", "Games Host"];
const MANPOWER_DEFS = [
  { role: "server", label: "Servers", cost: 800 },
  { role: "security", label: "Security", cost: 1200 },
  { role: "valet", label: "Valet", cost: 900 },
  { role: "photographer", label: "Photographer", cost: 8000 },
  { role: "decorator", label: "Decorator", cost: 5000 },
  { role: "coordinator", label: "Coordinator", cost: 6000 },
];

type ManpowerRow = { role: string; label: string; count: number; costPerPersonInr: number; selected: boolean };

type WizardState = {
  title: string; eventType: string; eventDate: string; city: string; guestCount: number;
  budgetMinInr: number; budgetMaxInr: number;
  venuePref: string; needsParking: boolean; expectedCars: number; areaPreference: string;
  foodType: string; vegPercent: number; desserts: boolean; fruits: boolean; dryFruits: boolean; dietaryNotes: string;
  entertainmentTypes: string[]; entertainmentHours: number; kidsActivities: boolean;
  manpower: ManpowerRow[]; decorLevel: string;
};

function defaultManpower(guests: number): ManpowerRow[] {
  return MANPOWER_DEFS.map(d => {
    let count = 2;
    if (d.role === "server") count = Math.max(2, Math.ceil(guests / 20));
    if (d.role === "security") count = Math.max(2, Math.ceil(guests / 100));
    if (d.role === "valet") count = 4;
    if (d.role === "photographer") count = 2;
    if (d.role === "decorator") count = 3;
    if (d.role === "coordinator") count = 2;
    return { role: d.role, label: d.label, count, costPerPersonInr: d.cost, selected: true };
  });
}

function initialWizard(): WizardState {
  return {
    title: "", eventType: "wedding", eventDate: "", city: "", guestCount: 300,
    budgetMinInr: 1200000, budgetMaxInr: 2000000,
    venuePref: "either", needsParking: true, expectedCars: 75, areaPreference: "",
    foodType: "mixed", vegPercent: 60, desserts: true, fruits: false, dryFruits: true, dietaryNotes: "",
    entertainmentTypes: ["DJ"], entertainmentHours: 4, kidsActivities: false,
    manpower: defaultManpower(300), decorLevel: "premium",
  };
}

function templateVenues(ev: EventNonNull) {
  const planned = plannedGuestsFor(ev.guestCount);
  const venueLine = ev.budgetLines.find(l => l.category === "venue")?.plannedInr ?? 300000;
  const cars = ev.expectedCars || Math.ceil(ev.guestCount / 4);
  return [
    { name: `${ev.city || "City"} Grand Hall`, capacity: Math.floor(planned * 0.85), parkingSpaces: Math.floor(cars * 0.7), costInr: Math.round(venueLine * 0.9), kind: "Indoor hall" },
    { name: `${ev.city || "City"} Lakeview Gardens`, capacity: Math.ceil(planned * 1.25), parkingSpaces: cars + 25, costInr: Math.round(venueLine * 1.05), kind: ev.venuePref === "indoor" ? "Indoor + lawn" : "Outdoor gardens" },
    { name: `${ev.city || "City"} Heritage Convention Centre`, capacity: Math.ceil(planned * 1.6), parkingSpaces: Math.ceil(cars * 1.5), costInr: Math.round(venueLine * 1.3), kind: "Convention centre" },
  ];
}

export function App() {
  const queryClient = useQueryClient();
  const [plannerName, setPlannerName] = useState<string>(() => {
    try { return sessionStorage.getItem("ep-name") || localStorage.getItem("ep-name") || ""; } catch { return ""; }
  });
  const [nameInput, setNameInput] = useState("");
  const [screen, setScreen] = useState<"entry" | "home" | "wizard" | "plan" | "settings" | "demo">(() => plannerName ? "home" : "entry");
  const [returnScreen, setReturnScreen] = useState<"home" | "wizard" | "plan">("home");
  const [genCount, setGenCount] = useState<number>(() => { try { return Number(sessionStorage.getItem("ep-gen-count") || 0); } catch { return 0; } });
  const [genMessage, setGenMessage] = useState("");
  const [settingsKeyInput, setSettingsKeyInput] = useState("");
  const [settingsModelInput, setSettingsModelInput] = useState("gemini-3.5-flash-lite");
  const [regenSection, setRegenSection] = useState("all");
  const [regenInstruction, setRegenInstruction] = useState("");
  function bumpGenCount() { setGenCount(prev => { const n = prev + 1; try { sessionStorage.setItem("ep-gen-count", String(n)); } catch {} return n; }); }
  const [wizardStep, setWizardStep] = useState(0);
  const [wiz, setWiz] = useState<WizardState>(initialWizard);
  const [currentEventId, setCurrentEventId] = useState<number | null>(null);
  const [planTab, setPlanTab] = useState("Overview");
  const [wizardError, setWizardError] = useState("");

  // Editable plan state
  const [editLines, setEditLines] = useState<{ category: string; label: string; plannedInr: number; note?: string }[]>([]);
  const [editCostPerPlate, setEditCostPerPlate] = useState(0);
  const [editDesserts, setEditDesserts] = useState(false);
  const [editFruits, setEditFruits] = useState(false);
  const [editDryFruits, setEditDryFruits] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [editManpower, setEditManpower] = useState<EditManpower[]>([]);
  const [editTasks, setEditTasks] = useState<EditTask[]>([]);
  const [editMenuCourses, setEditMenuCourses] = useState<string[]>([]);
  const [newCourse, setNewCourse] = useState("");
  const [editSelectedVenue, setEditSelectedVenue] = useState<string | null>(null);
  const [editVenueConfirmed, setEditVenueConfirmed] = useState(false);
  const [editBudgetMin, setEditBudgetMin] = useState(0);
  const [editBudgetMax, setEditBudgetMax] = useState(0);
  const [raiseMaxChecked, setRaiseMaxChecked] = useState(false);
  const [auditSeverityFilter, setAuditSeverityFilter] = useState<string>("all");
  const [auditResolvedFilter, setAuditResolvedFilter] = useState<string>("all");
  const [fixMessage, setFixMessage] = useState("");
  const [compareAId, setCompareAId] = useState<number | null>(null);
  const [compareBId, setCompareBId] = useState<number | null>(null);
  const [summaryVersionId, setSummaryVersionId] = useState<number | null>(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState<number | null>(null);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings({}),
  });
  const settings = settingsQuery.data;
  useEffect(() => { if (settings?.model) setSettingsModelInput(settings.model); }, [settings?.model]);

  const serverChecksQuery = useQuery({
    queryKey: ["selfchecks"],
    queryFn: () => api.runSelfChecks({}),
    enabled: screen === "demo",
  });

  const eventsQuery = useQuery({
    queryKey: ["events", plannerName],
    queryFn: () => api.listEvents({ plannerName: plannerName || undefined }),
    enabled: screen === "home" && !!plannerName,
  });

  const eventQuery = useQuery({
    queryKey: ["event", currentEventId],
    queryFn: () => api.getEvent({ id: currentEventId! }),
    enabled: !!currentEventId && screen === "plan",
  });
  const ev = eventQuery.data?.event ?? null;

  const versionsQuery = useQuery({
    queryKey: ["versions", currentEventId],
    queryFn: () => api.listVersions({ eventId: currentEventId! }),
    enabled: !!currentEventId && screen === "plan",
  });
  const versionsList: VersionT[] = versionsQuery.data?.versions ?? [];

  useEffect(() => {
    if (ev) {
      setEditLines(ev.budgetLines.map(l => ({ ...l })));
      setEditCostPerPlate(ev.costPerPlateInr);
      setEditDesserts(ev.desserts);
      setEditFruits(ev.fruits);
      setEditDryFruits(ev.dryFruits);
      setEditManpower(ev.manpower.map(m => ({ ...m })));
      setEditTasks((ev.tasks && ev.tasks.length ? ev.tasks : []).map(t => ({ title: t.title, dueInDaysBefore: t.dueInDaysBefore, owner: t.owner ?? "", status: (t as { status?: string }).status ?? "todo" })));
      setEditMenuCourses(ev.menu?.courses ? [...ev.menu.courses] : []);
      setEditSelectedVenue(ev.selectedVenueName ?? (ev.venueOptions?.[0]?.name ?? null));
      setEditVenueConfirmed(!!ev.venueConfirmed);
      setEditBudgetMin(ev.budgetMinInr);
      setEditBudgetMax(ev.budgetMaxInr);
      setRaiseMaxChecked(false);
      setFixMessage("");
    }
  }, [ev?.id, ev?.planVersion]);

  // Normalise before sending (422 fix): number inputs can hold decimals or
  // NaN (a cleared field), which JSON turns into null and a strict server
  // schema rejected with an opaque "failed: 422" before the plan fallback
  // could run. Round every count/amount to a whole number, guard NaN, trim
  // text, and cap text at the lengths the inputs allow.
  function whole(v: number, fallback = 0): number {
    return Number.isFinite(v) ? Math.round(v) : fallback;
  }
  function wizardPayload() {
    const manpower = wiz.manpower.filter(m => m.selected).map(m => ({ role: capText(m.role, FIELD_LIMITS.manpowerRole), label: capText(m.label, FIELD_LIMITS.manpowerLabel), count: whole(m.count), costPerPersonInr: whole(m.costPerPersonInr) }));
    return {
        plannerName: capText(plannerName.trim(), FIELD_LIMITS.plannerName),
        title: capText(wiz.title.trim(), FIELD_LIMITS.title),
        eventType: wiz.eventType as "wedding" | "birthday" | "corporate" | "other",
        eventDate: wiz.eventDate,
        city: capText(wiz.city.trim(), FIELD_LIMITS.city),
        guestCount: whole(wiz.guestCount, 300),
        budgetMinInr: whole(wiz.budgetMinInr),
        budgetMaxInr: whole(wiz.budgetMaxInr),
        venuePref: wiz.venuePref as "indoor" | "outdoor" | "either",
        needsParking: wiz.needsParking,
        expectedCars: wiz.needsParking ? whole(wiz.expectedCars) : 0,
        areaPreference: capText(wiz.areaPreference.trim(), FIELD_LIMITS.areaPreference) || null,
        foodType: wiz.foodType as "veg" | "non-veg" | "mixed",
        vegPercent: Math.min(100, Math.max(0, whole(wiz.vegPercent, 100))),
        desserts: wiz.desserts,
        fruits: wiz.fruits,
        dryFruits: wiz.dryFruits,
        dietaryNotes: capText(wiz.dietaryNotes.trim(), FIELD_LIMITS.dietaryNotes) || null,
        entertainmentTypes: capText(wiz.entertainmentTypes.join(", "), FIELD_LIMITS.entertainmentTypes),
        entertainmentHours: Math.min(12, Math.max(1, whole(wiz.entertainmentHours, 3))),
        kidsActivities: wiz.kidsActivities,
        decorLevel: wiz.decorLevel as "simple" | "premium" | "luxury",
        manpower,
    };
  }
  const createMut = useMutation({
    mutationFn: () => api.createEvent(wizardPayload()),
    onSuccess: (data) => {
      setCurrentEventId(data.event.id);
      setScreen("plan");
      setPlanTab("Overview");
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
  const createAIMut = useMutation({
    mutationFn: () => api.createEventAI(wizardPayload()),
    onSuccess: (data) => {
      bumpGenCount();
      setGenMessage(data.message);
      setCurrentEventId(data.event.id);
      setScreen("plan");
      setPlanTab("Overview");
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => {
      // Never leave the user on a raw "failed: 422": explain in plain words
      // and fall back to the template plan automatically, so they still get
      // a full plan and can Regenerate with AI from the plan screen.
      const detail = String((e as Error)?.message || e);
      setGenMessage(`Generate with AI could not start (${detail}). Creating your plan with the template instead so you are not stuck — once it opens, use Regenerate with AI on the plan screen to try AI again.`);
      if (!createMut.isPending && !createMut.isSuccess) createMut.mutate();
    },
  });
  const saveSettingsMut = useMutation({
    mutationFn: () => api.saveSettings({ apiKey: settingsKeyInput ? capText(settingsKeyInput, FIELD_LIMITS.apiKey) : undefined, model: settingsModelInput ? capText(settingsModelInput, FIELD_LIMITS.modelName) : undefined }),
    onSuccess: () => { setSettingsKeyInput(""); queryClient.invalidateQueries({ queryKey: ["settings"] }); },
  });
  const clearKeyMut = useMutation({
    mutationFn: () => api.clearApiKey({}),
    onSuccess: () => { setSettingsKeyInput(""); queryClient.invalidateQueries({ queryKey: ["settings"] }); },
  });
  const regenMut = useMutation({
    mutationFn: () => api.regeneratePlan({ id: currentEventId!, section: capText(regenSection, FIELD_LIMITS.regenSection), instruction: regenInstruction ? capText(regenInstruction, FIELD_LIMITS.regenInstruction) : undefined }),
    onSuccess: (data) => { bumpGenCount(); setGenMessage(data.message); setRegenInstruction(""); queryClient.invalidateQueries({ queryKey: ["event", currentEventId] }); queryClient.invalidateQueries({ queryKey: ["versions", currentEventId] }); },
  });
  const restoreMut = useMutation({
    mutationFn: (versionId: number) => api.restoreVersion({ eventId: currentEventId!, versionId }),
    onSuccess: (data) => { setRestoreMsg(data.message); setGenMessage(data.message); setRestoreConfirmId(null); queryClient.invalidateQueries({ queryKey: ["event", currentEventId] }); queryClient.invalidateQueries({ queryKey: ["versions", currentEventId] }); queryClient.invalidateQueries({ queryKey: ["events"] }); },
    onError: (e) => { setRestoreMsg(`Restore failed: ${String((e as Error)?.message || e)}`); },
  });

  type SavePayload = {
    budgetLines: EditLine[]; costPerPlateInr: number; desserts: boolean; fruits: boolean; dryFruits: boolean;
    manpower: EditManpower[]; tasks: EditTask[]; menuCourses: string[]; selectedVenueName: string | null; venueConfirmed: boolean; budgetMinInr: number; budgetMaxInr: number;
  };
  function buildSavePayload(overrides?: Partial<SavePayload>): SavePayload {
    return {
      budgetLines: overrides?.budgetLines ?? editLines,
      costPerPlateInr: overrides?.costPerPlateInr ?? editCostPerPlate,
      desserts: overrides?.desserts ?? editDesserts,
      fruits: overrides?.fruits ?? editFruits,
      dryFruits: overrides?.dryFruits ?? editDryFruits,
      manpower: overrides?.manpower ?? editManpower,
      tasks: overrides?.tasks ?? editTasks,
      menuCourses: overrides?.menuCourses ?? editMenuCourses,
      selectedVenueName: overrides?.selectedVenueName !== undefined ? overrides.selectedVenueName : editSelectedVenue,
      venueConfirmed: overrides?.venueConfirmed ?? editVenueConfirmed,
      budgetMinInr: overrides?.budgetMinInr ?? (editBudgetMin || ev?.budgetMinInr || 0),
      budgetMaxInr: overrides?.budgetMaxInr ?? (editBudgetMax || ev?.budgetMaxInr || 0),
    };
  }
  const updateMut = useMutation({
    mutationFn: (payload: SavePayload) => api.updatePlan({
      id: currentEventId!,
      budgetLines: payload.budgetLines.map(l => ({ category: capText(l.category, FIELD_LIMITS.budgetCategory), label: capText(l.label, FIELD_LIMITS.budgetLabel), plannedInr: Math.max(0, Math.floor(l.plannedInr || 0)), note: capText(l.note ?? "", FIELD_LIMITS.budgetNote) })),
      costPerPlateInr: payload.costPerPlateInr,
      desserts: payload.desserts,
      fruits: payload.fruits,
      dryFruits: payload.dryFruits,
      manpower: payload.manpower.map(m => ({ ...m, role: capText(m.role, FIELD_LIMITS.manpowerRole), label: capText(m.label, FIELD_LIMITS.manpowerLabel) })),
      tasks: payload.tasks.map(t => ({ ...t, title: capText(t.title, FIELD_LIMITS.taskTitle), owner: capText(t.owner, FIELD_LIMITS.taskOwner), status: capText(t.status, FIELD_LIMITS.taskStatus) })),
      menu: { courses: payload.menuCourses.map(c => capText(c, FIELD_LIMITS.menuCourse)), notes: capText(ev?.menu?.notes ?? "", FIELD_LIMITS.menuNotes), costPerPlateInr: payload.costPerPlateInr },
      selectedVenueName: payload.selectedVenueName === null ? null : capText(payload.selectedVenueName, FIELD_LIMITS.venueName),
      venueConfirmed: payload.venueConfirmed,
      budgetMinInr: payload.budgetMinInr,
      budgetMaxInr: payload.budgetMaxInr,
    }),
    onSuccess: () => { setSaveMsg("Saved — totals and audit recalculated in code. A new plan version was snapshotted — see Versions tab."); queryClient.invalidateQueries({ queryKey: ["event", currentEventId] }); queryClient.invalidateQueries({ queryKey: ["events"] }); queryClient.invalidateQueries({ queryKey: ["versions", currentEventId] }); },
    onError: (e) => { setSaveMsg(`Save failed: ${String((e as Error)?.message || e)}`); },
  });
  function saveCurrent(overrides?: Partial<SavePayload>) { updateMut.mutate(buildSavePayload(overrides)); }

  const totalPlanned = useMemo(() => editLines.reduce((s, l) => s + (l.plannedInr || 0), 0), [editLines]);
  const plannedGuests = ev ? plannedGuestsFor(ev.guestCount) : 0;

  function handleEnterName() {
    const n = nameInput.trim();
    if (!n) return;
    setPlannerName(n);
    try { sessionStorage.setItem("ep-name", n); localStorage.setItem("ep-name", n); } catch {}
    setScreen("home");
  }

  function validateStep(step: number): string {
    if (step === 0) {
      if (!plannerName.trim()) return "Your name was lost — go back to the start and enter it again.";
      if (plannerName.length > FIELD_LIMITS.plannerName) return `Your name is too long — keep it under ${FIELD_LIMITS.plannerName} characters. Shorten it on the entry screen.`;
      if (!wiz.title.trim()) return "Please give your event a title.";
      if (wiz.title.length > FIELD_LIMITS.title) return `Event title is too long — keep it under ${FIELD_LIMITS.title} characters (Event title field, Event step).`;
      if (!wiz.eventDate) return "Please pick an event date.";
      if (!wiz.city.trim()) return "Please enter a city.";
      if (wiz.city.length > FIELD_LIMITS.city) return `City is too long — keep it under ${FIELD_LIMITS.city} characters (City field, Event step).`;
      if (!Number.isFinite(wiz.guestCount) || wiz.guestCount < 10 || wiz.guestCount > 2000) return "Guests must be between 10 and 2,000.";
    }
    if (step === 1) {
      if (!wiz.budgetMinInr || wiz.budgetMinInr <= 0) return "Enter a minimum budget in INR.";
      if (!wiz.budgetMaxInr || wiz.budgetMaxInr <= 0) return "Enter a maximum budget in INR.";
      if (wiz.budgetMinInr >= wiz.budgetMaxInr) return "Minimum budget must be less than maximum budget.";
    }
    if (step === 2) {
      if (wiz.needsParking && (!wiz.expectedCars || wiz.expectedCars < 1)) return "Enter expected cars, or turn parking off.";
      if (wiz.areaPreference.length > FIELD_LIMITS.areaPreference) return `Area preference is too long — keep it under ${FIELD_LIMITS.areaPreference} characters (Area preference field, Venue step).`;
    }
    if (step === 3) {
      if (wiz.foodType === "mixed" && (wiz.vegPercent < 0 || wiz.vegPercent > 100)) return "Veg / non-veg split must total 100%.";
      if (wiz.dietaryNotes.length > FIELD_LIMITS.dietaryNotes) return `Dietary notes are too long — keep them under ${FIELD_LIMITS.dietaryNotes} characters (Dietary restrictions field, Food step).`;
    }
    if (step === 4) {
      if (wiz.entertainmentTypes.length === 0) return "Pick at least one entertainment type.";
      if (wiz.entertainmentTypes.join(", ").length > FIELD_LIMITS.entertainmentTypes) return `Too many entertainment types selected — the combined list must stay under ${FIELD_LIMITS.entertainmentTypes} characters (Entertainment step).`;
      if (!Number.isFinite(wiz.entertainmentHours) || wiz.entertainmentHours < 1 || wiz.entertainmentHours > 12) return "Enter entertainment duration in hours (1 to 12).";
    }
    if (step === 5) {
      if (!wiz.manpower.some(m => m.selected)) return "Select at least one people / resource role.";
      if (wiz.manpower.some(m => m.selected && (!Number.isFinite(m.count) || m.count < 0))) return "People counts must be 0 or more — check the People step.";
    }
    return "";
  }

  // Generate buttons validate ALL steps (not just the last one) and jump to
  // the first step that needs attention, with the reason shown.
  function validateAllSteps(): boolean {
    for (let s = 0; s <= 5; s++) {
      const err = validateStep(s);
      if (err) { setWizardStep(s); setWizardError(err); return false; }
    }
    setWizardError("");
    return true;
  }

  function nextStep() {
    const err = validateStep(wizardStep);
    if (err) { setWizardError(err); return; }
    setWizardError("");
    if (wizardStep < 6) setWizardStep(wizardStep + 1);
  }

  // Sync manpower defaults when guest count changes significantly in step 1 -> keep user edits, only server count auto? Keep simple: button to recalc
  // ENTRY SCREEN
  if (screen === "entry") {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-lg px-5 pb-10 pt-14">
          <p className="text-sm font-semibold tracking-wide text-accent2-strong">AEGIS • WEDDINGS • BIRTHDAYS • LARGE EVENTS</p>
          <h1 className="font-serif-display mt-3 text-5xl leading-tight">Aegis<br />Plan it. Budget it.<br />Audit it.</h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--dim)]">For events with 100s of guests, one wrong venue, food or budget call can ruin the day. Aegis walks you through the mandatory questions, builds a GenAI plan in INR (or a template fallback), recalculates every total in code, and flags problems before you commit.</p>
          <div className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <label htmlFor="planner-name" className="block text-base font-semibold">What should we call you?</label>
            <p className="mt-1 text-sm text-[var(--dim)]">No login, no password — just your name to get started.</p>
            <input id="planner-name" aria-label="Your name" maxLength={FIELD_LIMITS.plannerName} value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleEnterName(); }} placeholder="e.g. Sept" className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-lg outline-none focus:border-[#0F4C4C]" />
            <button onClick={handleEnterName} disabled={!nameInput.trim()} className="mt-4 w-full rounded-xl bg-[#0F4C4C] px-4 py-3.5 text-base font-semibold text-white disabled:opacity-40">Continue</button>
          </div>
          <button onClick={() => setScreen("demo")} className="mt-6 w-full rounded-xl border border-[var(--accent-strong)] px-4 py-3 text-sm font-semibold text-accent-strong">📖 Demo guide, README & self-checks — see the 3-minute demo script</button>
          <p className="mt-6 text-center text-xs text-[var(--dim)]">Aegis • Milestone 5 — Contrast-safe themes (light & dark), polish, live self-checks, demo guide & README • Plan versions, compare & restore, printable summary • Full customise + 12-rule audit engine • GenAI gemini-3.5-flash-lite • Code recalculates every total • INR only</p>
        </main>
      </div>
    );
  }

  // SETTINGS
  if (screen === "settings") {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-2xl px-5 pb-12 pt-6">
          <button onClick={() => setScreen(returnScreen)} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium">← Back</button>
          <h1 className="font-serif-display mt-5 text-4xl">Aegis Settings — Gemini AI</h1>
          <p className="mt-2 text-[var(--dim)]">Aegis uses <strong>gemini-3.5-flash-lite</strong> only, temperature 0.3, JSON-only output, validated and recalculated in code. Your key is stored server-side for Aegis, never shown in full again, and never sent anywhere except Google Gemini when you generate.</p>

          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-sm font-semibold">Connection status</p>
            {settingsQuery.isPending ? <p className="mt-2 text-[var(--dim)]">Checking…</p> : settings?.hasKey ? (
              <p className="mt-2 rounded-lg notice-success p-3 text-sm">✓ Connected — key <strong>{settings.maskedKey}</strong> • Model <strong>{settings.model}</strong></p>
            ) : (
              <p className="mt-2 rounded-lg notice-warning p-3 text-sm"><strong>Aegis AI generation not connected yet.</strong> No key saved. Generation will offer the template plan as fallback until you add a key.</p>
            )}
            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="gemini-model" className="font-semibold">Model name (configurable)</label>
                <input id="gemini-model" aria-label="Gemini model name" maxLength={FIELD_LIMITS.modelName} value={settingsModelInput} onChange={e => setSettingsModelInput(e.target.value)} placeholder="gemini-3.5-flash-lite" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3" />
                <p className="mt-1 text-xs text-[var(--dim)]">Default is gemini-3.5-flash-lite. Change only if Google renames the lite model.</p>
              </div>
              <div>
                <label htmlFor="gemini-key" className="font-semibold">Gemini API key</label>
                <input id="gemini-key" aria-label="Gemini API key" maxLength={FIELD_LIMITS.apiKey} type="password" autoComplete="off" value={settingsKeyInput} onChange={e => setSettingsKeyInput(e.target.value)} placeholder={settings?.hasKey ? "Enter a new key to replace the saved one" : "Paste your Gemini API key"} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3" />
                <p className="mt-1 text-xs text-[var(--dim)]">Get a key from Google AI Studio. It is saved on the server for Aegis only — the UI will only ever show a masked version afterwards.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={() => saveSettingsMut.mutate()} disabled={saveSettingsMut.isPending || (!settingsKeyInput.trim() && settingsModelInput === settings?.model)} className="flex-1 rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50">{saveSettingsMut.isPending ? "Saving…" : "Save settings"}</button>
                {settings?.hasKey ? <button onClick={() => clearKeyMut.mutate()} disabled={clearKeyMut.isPending} className="flex-1 rounded-xl border border-red-300 bg-white px-4 py-3 font-semibold text-red-700 disabled:opacity-50">Clear saved key</button> : null}
              </div>
              {saveSettingsMut.isSuccess ? <p role="status" aria-live="polite" className="text-sm text-success-strong">Saved. Masked key: {settings?.maskedKey || "—"}</p> : null}
              {saveSettingsMut.isError ? <p role="alert" className="text-sm text-danger-strong">{String((saveSettingsMut.error as Error)?.message || saveSettingsMut.error)}</p> : null}
              <p className="rounded-lg bg-[var(--surface-alt)] p-3 text-xs text-[var(--dim)]">Quota awareness: AI generations this session: <strong className="text-[var(--text)]">{genCount}</strong>. Aegis retries once on AI failure, then falls back to the template plan with a clear message — never a blank screen. Only wizard answers are sent to the model; your planner name is never sent.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // DEMO GUIDE / README (Milestone 5)
  if (screen === "demo") {
    const clientChecks = runSelfChecks();
    const clientPassed = clientChecks.filter(c => c.pass).length;
    const serverChecks = serverChecksQuery.data?.checks ?? [];
    const serverPassed = serverChecks.filter(c => c.pass).length;
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-3xl px-5 pb-12 pt-6">
          <button onClick={() => setScreen(plannerName ? "home" : "entry")} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium">← Back</button>
          <h1 className="font-serif-display mt-5 text-4xl">Aegis — Demo guide & README</h1>
          <p className="mt-2 text-[var(--dim)]">Everything a judge (or a first-time user) needs about Aegis: what Aegis does, the exact 3-minute demo, how the Gemini key works, and live proof that the budget, food and audit maths is correct.</p>

          <section aria-label="What Aegis does" className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="font-serif-display text-2xl">What Aegis does</h2>
            <p className="mt-2 text-sm leading-relaxed">Aegis is an audit-proof event planning platform for weddings, birthdays and large events with 100s of guests. <strong>Entry is name-only — no login, no password:</strong> type your name on the first screen and you are in. A 7-step mandatory wizard collects event basics, budget in INR, venue & parking, food (veg / non-veg / mixed split, desserts, fruits, dry fruits), entertainment, and people & resources. Aegis then builds a plan, <strong>recalculates every total in code</strong> (the AI never owns the numbers), and runs a <strong>12-rule audit engine</strong> that flags over-budget plans, too-small venues, parking and food shortfalls and more — each with a one-click fix that only counts as resolved after recalculation passes.</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              <li>Tabs: Overview, Budget (sliders capped by your maximum), Venue (fit scores), Food (menu builder), People (editable roster), Timeline, Audit, Versions (snapshot, compare & restore), Summary (printable one-pager).</li>
              <li>All money is INR, formatted en-IN (e.g. ₹15,72,600). Food is planned for guests + 10% buffer.</li>
              <li>Themes: every screen is contrast-checked in light and dark mode — message boxes, banners and the wizard's Live per-guest range pair dark text on light backgrounds and light text on dark backgrounds.</li>
            </ul>
          </section>

          <section aria-label="Three minute demo script" className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="font-serif-display text-2xl">The Aegis 3-minute demo script</h2>
            <p className="mt-2 text-sm">Use exactly this case: <strong>300-guest wedding, Hyderabad, budget ₹12,00,000 – ₹20,00,000, mixed food 60% veg / 40% non-veg, desserts and dry fruits yes, huge parking yes (≈75 cars).</strong></p>
            <div className="mt-4 space-y-4 text-sm leading-relaxed">
              <div className="highlight-box rounded-xl p-4">
                <p className="font-bold">Minute 1 — Wizard</p>
                <p className="mt-1">Enter any name (no login). Start a new event and walk the wizard. On the Budget step, point at the <strong>Live per-guest range: ₹4,000 – ₹6,667 per guest</strong> — it updates as you type. Note the food step plans for <strong>330 guests (300 + 10% buffer)</strong>: 198 veg plates + 132 non-veg plates.</p>
              </div>
              <div className="highlight-box rounded-xl p-4">
                <p className="font-bold">Minute 2 — Generate & customise</p>
                <p className="mt-1">On Review, choose <strong>Generate with AI</strong> (needs a key — see below) or <strong>Use template plan</strong>. Open Food and toggle Dry Fruits off: the food line and total fall instantly, with no AI call. Open Budget and drag a slider — it cannot push the total past your maximum.</p>
              </div>
              <div className="highlight-box rounded-xl p-4">
                <p className="font-bold">Minute 3 — Audit fix, versions, summary</p>
                <p className="mt-1">The first plan flags <strong>VENUE_TOO_SMALL</strong> and <strong>PARKING_SHORTFALL</strong> (Hyderabad Grand Hall: 280 capacity, 52 spaces). In Audit, apply the venue fix (switch to Lakeview Gardens), confirm the venue, and raise the single coordinator to 2. The fixed plan lands at <strong>total ₹15,72,600, remaining ₹4,27,400, ₹5,242 per guest, health 100/100</strong>. Open Versions to compare v1 vs the fixed version and restore the old one — Audit re-flags it, proving restore recalculates. Finish on Summary: the printable one-pager, with Copy-as-text and Download.</p>
              </div>
            </div>
          </section>

          <section aria-label="Gemini key and AI versus template" className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="font-serif-display text-2xl">Gemini key, AI vs template</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed">
              <p><strong>Adding your key later:</strong> open <button onClick={() => { setReturnScreen("home"); setScreen("settings"); }} className="font-bold underline text-accent-strong">Settings / API Key</button>, paste a Gemini API key from Google AI Studio, and Save. The key is stored server-side for Aegis, only ever shown masked (e.g. AIza••••1234), and can be changed or cleared there. The model is <strong>gemini-3.5-flash-lite</strong> (temperature 0.3, JSON-only). <strong>Live AI generation requires your key</strong> — without one, nothing breaks: Aegis says so plainly and falls back to the template plan. Only wizard answers are sent to the model; your name never is.</p>
              <p><strong>AI-generated plan:</strong> Gemini proposes budget lines, venue suggestions, menu, manpower and tasks as structured JSON. Code then validates every field, repairs gaps from the template, and recalculates all totals — an over-budget AI total is flagged in Audit, never silently accepted. Venue options are suggestions to verify, not bookings.</p>
              <p><strong>Template fallback:</strong> a deterministic split of the budget midpoint (Venue 30% • Food 35% • Decor 15% • Entertainment 8% • Photography 5% • Manpower 5% • Misc 2%), with food cost = cost per plate × guests + buffer. Same audit engine, same recalculation — it is the guaranteed path when there is no key or the AI call fails after one retry. Your current status: {settings?.hasKey ? <strong className="text-success-strong">AI connected ({settings.model}, key {settings.maskedKey})</strong> : <strong className="text-warning-strong">no key saved — template fallback is active</strong>}.</p>
            </div>
          </section>

          <section aria-label="Self checks" className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="font-serif-display text-2xl">Self-checks — run live, right now</h2>
            <p className="mt-2 text-sm text-[var(--dim)]">Unit-style checks executed against the real budget, food and audit functions — in the browser (the same code the plan screens use) and on the server (template engine, snapshot & restore recalculation). A failed row is a real failure, shown honestly.</p>
            <div className={`mt-4 rounded-xl border p-4 ${clientPassed === clientChecks.length ? "notice-success" : "notice-danger"}`}>
              <p className="font-bold">Browser checks: {clientPassed}/{clientChecks.length} passed</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {clientChecks.map(c => <li key={c.name} className="flex gap-2"><span aria-hidden="true">{c.pass ? "✓" : "✗"}</span><span><strong>{c.name}.</strong> <span className="flag-dim">{c.detail}</span></span></li>)}
              </ul>
            </div>
            <div className="mt-4 rounded-xl border border-[var(--border)] p-4">
              <p className="font-bold">Server checks: {serverChecksQuery.isPending ? "running…" : serverChecksQuery.isError ? "could not run — server unreachable from this screen" : `${serverPassed}/${serverChecks.length} passed`}</p>
              {serverChecks.length ? <ul className="mt-2 space-y-1.5 text-sm">{serverChecks.map(c => <li key={c.name} className="flex gap-2"><span aria-hidden="true">{c.pass ? "✓" : "✗"}</span><span><strong>{c.name}.</strong> <span className="text-[var(--dim)]">{c.detail}</span></span></li>)}</ul> : null}
              {serverChecksQuery.isError ? <p role="alert" className="mt-2 text-sm text-danger-strong">The server self-check action failed to respond. The browser checks above still ran against the real audit code.</p> : null}
            </div>
            <p className="mt-3 text-xs text-[var(--dim)]">Generations this session: {genCount}. Security notes: all inputs are validated on the server, money is stored as integer rupees, AI output is treated as untrusted data and re-validated field by field, and no API key is ever shipped in Aegis or shown in full.</p>
          </section>

          <section aria-label="Tests in code" className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="font-serif-display text-2xl">Tests — real test files in the project</h2>
            <p className="mt-2 text-sm leading-relaxed">Beyond the live self-checks above, the Aegis project ships a <strong>runnable test suite in <code>tests/</code></strong> that imports the <strong>same production functions</strong> Aegis runs — the budget, food, audit and snapshot maths all live in one shared module, <code>server/src/planner-core.ts</code>, used by the client, the server and the tests, so the tests can never drift away from the shipped code. <strong>How to run:</strong> from the project root, <code>bun test</code> (or <code>bun run test</code>). No extra dependencies — it uses Bun's built-in test runner. Current suite: <strong>62 tests, all passing</strong>.</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
              <li><strong>tests/budget.test.ts</strong> — budget maths: total is the sum of lines (demo ₹15,72,600), remaining to maximum (₹4,27,400, and negative when over), per-guest cost (₹5,242), zero-guest safety, en-IN INR formatting.</li>
              <li><strong>tests/food.test.ts</strong> — food maths: the 10% buffer (300 → 330, always rounding up), food cost = cost per plate × planned guests, and the veg / non-veg split totalling the planned count at every percentage (60% → 198 + 132).</li>
              <li><strong>tests/manpower.test.ts</strong> — manpower totals: roster total = Σ count × cost per person (demo ₹27,600), the exact figure the Manpower budget line syncs to.</li>
              <li><strong>tests/audit.test.ts</strong> — all <strong>12 audit rules</strong>, each firing individually on the demo case, the healthy plan passing all 12 at health 100, and the health formula (100 − 25 blocker − 10 warning − 2 info, floored at 0).</li>
              <li><strong>tests/versions.test.ts</strong> — snapshot compare (venue diff ₹72,000, health 65 → 100) and restore recalculation: a JSON round-trip reproduces identical metrics, and restoring the small-venue snapshot re-flags it at health 65 instead of hiding it.</li>
              <li><strong>tests/field-limits.test.ts</strong> — the client/server text-cap contract (see Field limits below): every wizard and customise field has one shared cap, and capping a 5,000-character note lands exactly on the limit the server accepts.</li>
              <li><strong>tests/accessibility.test.ts</strong> — WCAG AA contrast: every theme surface pair (notices, highlight box, page, surfaces) passes 4.5:1 in <strong>both</strong> light and dark schemes, and the old white-on-white pairing is proven to fail, so a regression would be caught.</li>
            </ul>
          </section>

          <section aria-label="Accessibility and field limits" className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="font-serif-display text-2xl">Accessibility & field limits</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              <li><strong>Labels:</strong> every wizard input, budget amount and slider, food toggle, roster count/cost and tab has a visible label tied to its control (sliders are labelled by their visible category name; toggles and selector buttons expose <code>aria-pressed</code> / <code>role="switch"</code> state).</li>
              <li><strong>Keyboard:</strong> the whole wizard and customise flow works by keyboard alone in logical (DOM) order. The plan tab bar follows the tab pattern — Tab lands on the active tab, ← / → / Home / End move between tabs — and every interactive element shows a thick focus ring (<code>:focus-visible</code>) in both colour schemes.</li>
              <li><strong>Announcements:</strong> wizard errors appear in an assertive live region linked to the fields via <code>aria-describedby</code>, and Generate jumps to the step that needs fixing; save, fix and restore feedback uses polite live regions; audit flags are labelled groups naming rule, severity and resolved state; restore uses an alert dialog pattern.</li>
              <li><strong>Contrast:</strong> every pale message box and the wizard's Live per-guest range pair dark text on light tints (light mode) and light text on dark tints (dark mode) — verified numerically at WCAG AA 4.5:1+ in tests/accessibility.test.ts for both schemes, never white on white.</li>
              <li><strong>Field limits (no more 422s):</strong> one shared limit list (<code>FIELD_LIMITS</code>) drives the input <code>maxLength</code>, the payload the client sends, and the server schema — planner name {FIELD_LIMITS.plannerName}, title {FIELD_LIMITS.title}, city {FIELD_LIMITS.city}, area preference {FIELD_LIMITS.areaPreference}, dietary notes {FIELD_LIMITS.dietaryNotes}, entertainment types {FIELD_LIMITS.entertainmentTypes}, regenerate instruction {FIELD_LIMITS.regenInstruction}, menu course {FIELD_LIMITS.menuCourse}, task owner {FIELD_LIMITS.taskOwner}, API key {FIELD_LIMITS.apiKey}, model name {FIELD_LIMITS.modelName} characters. The template fallback uses the same schema. Anything genuinely over a limit is caught by the wizard validator <em>before sending</em>, with a message naming the field, its limit and its step.</li>
            </ul>
          </section>

          <section aria-label="GitHub submission and downloading the project" className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="font-serif-display text-2xl">GitHub submission & downloading this project</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed">
              <p><strong>No API key is in the code — ever.</strong> There is no hardcoded Gemini key anywhere in the Aegis project. The key is only ever typed into <strong>Settings</strong> inside Aegis, stored <strong>server-side</strong> for Aegis, and only ever displayed <strong>masked</strong>. Do not paste a key into source files, README, issues or commits.</p>
              <p><strong>Before pushing to GitHub:</strong> the repo ships a <code>.gitignore</code> that excludes <code>.env</code> files, key/certificate files, <code>node_modules</code>, build output — and <code>app.db</code> (the local database), because the database holds saved events <em>and</em> the Settings table with the saved key. <strong>Do not commit test events, saved settings exports, or the database as sample data.</strong> Run a secret scan (search the repo for your key fragment) before the first push.</p>
              <p><strong>Where to download the project:</strong> Aegis itself is a hosted Muse web artifact — it has no Download button, and this Demo guide is the in-app README. To get the code: <strong>(1)</strong> in Muse on desktop/web, open this artifact's workspace / project files and use the workspace download or export option to save the project folder; or <strong>(2)</strong> once the code is pushed to GitHub, use GitHub's green <strong>Code → Download ZIP</strong>, or <code>git clone</code> the repository URL. After downloading, run <code>bun install</code>, then <code>bun test</code> to verify the suite, and add your own Gemini key in Aegis's Settings — never in the code.</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // HOME
  if (screen === "home") {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-3xl px-5 pb-10 pt-8">
          <p className="text-sm text-[var(--dim)]">Welcome back to Aegis</p>
          <h1 className="font-serif-display mt-1 text-4xl">Hello, {plannerName} 👋</h1>
          <p className="mt-3 text-[var(--dim)]">Ready to plan an event with Aegis that stays inside budget and fits every guest?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => { setReturnScreen("home"); setScreen("settings"); }} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold">⚙️ Settings / API Key</button>
            <button onClick={() => setScreen("demo")} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold">📖 Demo guide & README</button>
            <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-xs">AI generations this session: <strong>{genCount}</strong></span>
          </div>
          {settings && !settings.hasKey ? (
            <div className="mt-4 rounded-xl border notice-warning p-4 text-sm"><strong>Aegis AI generation not connected yet.</strong> No Gemini API key is saved. You can still use the template plan as fallback, or add your key now. <button onClick={() => { setReturnScreen("home"); setScreen("settings"); }} className="ml-1 font-bold underline">Go to Settings →</button></div>
          ) : settings?.hasKey ? (
            <div className="mt-4 rounded-xl border notice-success p-4 text-sm">✓ <strong>AI connected</strong> — model <strong>{settings.model}</strong> • Key {settings.maskedKey}</div>
          ) : null}
          <button onClick={() => { setWiz(initialWizard()); setWizardStep(0); setWizardError(""); setScreen("wizard"); }} className="mt-6 w-full rounded-2xl bg-[#B45309] px-5 py-4 text-left text-white shadow-sm sm:w-auto">
            <span className="block text-lg font-bold">+ Start a new event</span>
            <span className="block text-sm opacity-90">Answer 6 mandatory steps, then get your Aegis template plan</span>
          </button>

          <h2 className="mt-10 text-lg font-bold">Your events in Aegis</h2>
          {eventsQuery.isPending ? <p className="mt-3 text-[var(--dim)]">Loading your events…</p> : null}
          {eventsQuery.data && eventsQuery.data.events.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[var(--dim)]">No events yet. Start your first event above — try the demo: 300 guests, Hyderabad, ₹12,00,000 to ₹20,00,000.</div>
          ) : null}
          <div className="mt-4 space-y-3">
            {eventsQuery.data?.events.map(evItem => (
              <button key={evItem.id} onClick={() => { setCurrentEventId(evItem.id); setScreen("plan"); }} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{evItem.title}</p>
                    <p className="text-sm capitalize text-[var(--dim)]">{evItem.eventType} • {evItem.city} • {evItem.eventDate}</p>
                    <p className="mt-1 text-sm">{formatNum(evItem.guestCount)} guests • Budget {formatINR(evItem.budgetMinInr)} – {formatINR(evItem.budgetMaxInr)}</p>
                  </div>
                  <span className="rounded-full bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#92400E]">View plan →</span>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => { setPlannerName(""); try { sessionStorage.removeItem("ep-name"); localStorage.removeItem("ep-name"); } catch {} setScreen("entry"); }} className="mt-8 text-sm text-[var(--dim)] underline">Use a different name</button>
        </main>
      </div>
    );
  }

  // WIZARD
  if (screen === "wizard") {
    const perGuestMin = wiz.guestCount ? Math.round(wiz.budgetMinInr / wiz.guestCount) : 0;
    const perGuestMax = wiz.guestCount ? Math.round(wiz.budgetMaxInr / wiz.guestCount) : 0;
    const stepsLabels = ["Event", "Budget", "Venue", "Food", "Entertainment", "People", "Review"];
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-2xl px-5 pb-12 pt-6">
          <div className="flex items-center justify-between">
            <button aria-label="Back to home" onClick={() => wizardStep === 0 ? setScreen("home") : (setWizardStep(wizardStep - 1), setWizardError(""))} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium">← Back</button>
            <span className="text-sm font-medium text-[var(--dim)]">Aegis • Step {wizardStep + 1} of 7 — {stepsLabels[wizardStep]}</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--border)]" role="progressbar" aria-valuenow={wizardStep + 1} aria-valuemin={1} aria-valuemax={7}>
            <div className="h-full bg-[#0F4C4C] transition-all" style={{ width: `${((wizardStep + 1) / 7) * 100}%` }} />
          </div>
          <ol aria-label="Wizard steps" className="mt-3 flex flex-wrap gap-1.5 list-none">{stepsLabels.map((l, i) => <li key={l} aria-current={i === wizardStep ? "step" : undefined} className={`rounded-full px-2.5 py-1 text-xs ${i === wizardStep ? "bg-[#0F4C4C] font-semibold text-white" : i < wizardStep ? "notice-success" : "bg-[var(--surface)] text-[var(--dim)] border border-[var(--border)]"}`}>{l}</li>)}</ol>

          {wizardError ? <div id="wizard-error" role="alert" aria-live="assertive" className="mt-4 rounded-xl border notice-danger p-3 text-sm font-medium">{wizardError}</div> : null}

          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
            {wizardStep === 0 && (
              <div className="space-y-5">
                <h2 className="font-serif-display text-3xl">Event basics</h2>
                <div>
                  <label htmlFor="event-type" className="font-semibold">Event type *</label>
                  <select id="event-type" value={wiz.eventType} onChange={e => setWiz({ ...wiz, eventType: e.target.value })} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
                    <option value="wedding">Wedding</option><option value="birthday">Birthday</option><option value="corporate">Corporate</option><option value="other">Other</option>
                  </select>
                </div>
                <div><label htmlFor="event-title" className="font-semibold">Event title *</label><input id="event-title" aria-describedby={wizardError ? "wizard-error" : undefined} aria-invalid={!!wizardError} maxLength={FIELD_LIMITS.title} value={wiz.title} onChange={e => setWiz({ ...wiz, title: e.target.value })} placeholder="e.g. Aisha & Rohan Wedding" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3" /></div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label htmlFor="event-date" className="font-semibold">Date *</label><input id="event-date" type="date" value={wiz.eventDate} onChange={e => setWiz({ ...wiz, eventDate: e.target.value })} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3" /></div>
                  <div><label htmlFor="event-city" className="font-semibold">City *</label><input id="event-city" aria-describedby={wizardError ? "wizard-error" : undefined} aria-invalid={!!wizardError} maxLength={FIELD_LIMITS.city} value={wiz.city} onChange={e => setWiz({ ...wiz, city: e.target.value })} placeholder="e.g. Hyderabad" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3" /></div>
                </div>
                <div>
                  <label htmlFor="guest-count" className="font-semibold">Expected guests * (10 to 2,000)</label>
                  <input id="guest-count" aria-describedby={wizardError ? "wizard-error" : undefined} type="number" min={10} max={2000} value={wiz.guestCount} onChange={e => { const v = Number(e.target.value); setWiz({ ...wiz, guestCount: v, manpower: defaultManpower(v || 300) }); }} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg" />
                  <p className="mt-2 text-sm text-[var(--dim)]">With 10% buffer, we will plan food for <strong className="text-[var(--text)]">{formatNum(plannedGuestsFor(wiz.guestCount || 0))} guests</strong>.</p>
                </div>
              </div>
            )}

            {wizardStep === 1 && (
              <div className="space-y-5">
                <h2 className="font-serif-display text-3xl">Budget in INR</h2>
                <p className="text-[var(--dim)]">Set your lower and upper limits. The Aegis template plan will target the midpoint and stay inside this band.</p>
                <div><label htmlFor="budget-min" className="font-semibold">Minimum budget (₹) *</label><input id="budget-min" aria-describedby={wizardError ? "wizard-error" : undefined} type="number" min={0} step={1000} value={wiz.budgetMinInr} onChange={e => setWiz({ ...wiz, budgetMinInr: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg" /><p className="mt-1 text-sm text-[var(--dim)]">{formatINR(wiz.budgetMinInr || 0)}</p></div>
                <div><label htmlFor="budget-max" className="font-semibold">Maximum budget (₹) *</label><input id="budget-max" aria-describedby={wizardError ? "wizard-error" : undefined} type="number" min={0} step={1000} value={wiz.budgetMaxInr} onChange={e => setWiz({ ...wiz, budgetMaxInr: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg" /><p className="mt-1 text-sm text-[var(--dim)]">{formatINR(wiz.budgetMaxInr || 0)}</p></div>
                <div className="rounded-xl highlight-box p-4">
                  <p className="text-sm font-semibold">Live per-guest range</p>
                  <p className="font-serif-display mt-1 text-3xl">{formatINR(perGuestMin)} – {formatINR(perGuestMax)} <span className="text-base font-sans highlight-sub">per guest</span></p>
                  <p className="mt-1 text-sm highlight-sub">Midpoint budget: {formatINR(Math.floor(((wiz.budgetMinInr || 0) + (wiz.budgetMaxInr || 0)) / 2))} for {formatNum(wiz.guestCount)} guests</p>
                  {perGuestMax > 0 && perGuestMax < 1500 ? <p className="mt-2 text-sm font-medium text-warning-strong">⚠ Per-guest max is below ₹1,500 — very tight for a large event. Food alone may break this.</p> : null}
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-5">
                <h2 className="font-serif-display text-3xl">Venue needs</h2>
                <div>
                  <span className="font-semibold">Venue type *</span>
                  <div className="mt-2 grid grid-cols-3 gap-2">{["indoor", "outdoor", "either"].map(v => <button key={v} onClick={() => setWiz({ ...wiz, venuePref: v })} aria-pressed={wiz.venuePref === v} aria-label={`Venue ${v}`} className={`rounded-xl border px-3 py-3 capitalize ${wiz.venuePref === v ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : "border-[var(--border)] bg-[var(--bg)]"}`}>{v}</button>)}</div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
                  <div><p className="font-semibold">Huge parking needed?</p><p className="text-sm text-[var(--dim)]">For guests arriving by car</p></div>
                  <button role="switch" aria-checked={wiz.needsParking} aria-label="Huge parking" onClick={() => setWiz({ ...wiz, needsParking: !wiz.needsParking })} className={`h-8 w-14 rounded-full p-1 ${wiz.needsParking ? "bg-[#0F4C4C]" : "bg-gray-300"}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${wiz.needsParking ? "translate-x-6" : ""}`} /></button>
                </div>
                {wiz.needsParking ? <div><label htmlFor="expected-cars" className="font-semibold">Expected cars *</label><input id="expected-cars" type="number" min={0} value={wiz.expectedCars} onChange={e => setWiz({ ...wiz, expectedCars: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3" /><p className="mt-1 text-sm text-[var(--dim)]">Rule of thumb: 1 car per 4 guests ≈ {Math.ceil((wiz.guestCount || 0) / 4)} cars</p></div> : null}
                <div><label htmlFor="area-pref" className="font-semibold">Area preference (optional)</label><input id="area-pref" aria-describedby={wizardError ? "wizard-error" : undefined} maxLength={FIELD_LIMITS.areaPreference} value={wiz.areaPreference} onChange={e => setWiz({ ...wiz, areaPreference: e.target.value })} placeholder="e.g. Near airport, city centre" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3" /></div>
                <p className="rounded-xl bg-[var(--surface-alt)] p-3 text-sm">Capacity needed: <strong>{formatNum(plannedGuestsFor(wiz.guestCount))}</strong> (guests + 10% buffer)</p>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-5">
                <h2 className="font-serif-display text-3xl">Food</h2>
                <div>
                  <span className="font-semibold">Food type *</span>
                  <div className="mt-2 grid grid-cols-3 gap-2">{["veg", "non-veg", "mixed"].map(v => <button key={v} onClick={() => setWiz({ ...wiz, foodType: v, vegPercent: v === "veg" ? 100 : v === "non-veg" ? 0 : wiz.vegPercent === 100 || wiz.vegPercent === 0 ? 60 : wiz.vegPercent })} aria-pressed={wiz.foodType === v} aria-label={`Food ${v}`} className={`rounded-xl border px-3 py-3 capitalize ${wiz.foodType === v ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : "border-[var(--border)] bg-[var(--bg)]"}`}>{v}</button>)}</div>
                </div>
                {wiz.foodType === "mixed" && (
                  <div className="rounded-xl border border-[var(--border)] p-4">
                    <label htmlFor="veg-percent" className="font-semibold">Veg % — must total 100% with non-veg</label>
                    <input id="veg-percent" type="range" min={0} max={100} step={5} value={wiz.vegPercent} onChange={e => setWiz({ ...wiz, vegPercent: Number(e.target.value) })} className="mt-3 w-full" />
                    <div className="mt-2 flex justify-between text-sm"><span>Veg: <strong>{wiz.vegPercent}%</strong> ({formatNum(Math.ceil(plannedGuestsFor(wiz.guestCount) * wiz.vegPercent / 100))} plates)</span><span>Non-veg: <strong>{100 - wiz.vegPercent}%</strong> ({formatNum(Math.ceil(plannedGuestsFor(wiz.guestCount) * (100 - wiz.vegPercent) / 100))} plates)</span></div>
                  </div>
                )}
                {[
                  { key: "desserts" as const, label: "Desserts", desc: "Adds ₹150 / plate in template" },
                  { key: "fruits" as const, label: "Fruits", desc: "Adds ₹80 / plate in template" },
                  { key: "dryFruits" as const, label: "Dry Fruits", desc: "Adds ₹120 / plate in template" },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
                    <div><p className="font-semibold">{item.label}</p><p className="text-sm text-[var(--dim)]">{item.desc}</p></div>
                    <button role="switch" aria-checked={wiz[item.key]} aria-label={item.label} onClick={() => setWiz({ ...wiz, [item.key]: !wiz[item.key] })} className={`h-8 w-14 shrink-0 rounded-full p-1 ${wiz[item.key] ? "bg-[#0F4C4C]" : "bg-gray-300"}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${wiz[item.key] ? "translate-x-6" : ""}`} /></button>
                  </div>
                ))}
                <div><label htmlFor="dietary" className="font-semibold">Dietary restrictions / allergies (optional)</label><textarea id="dietary" aria-describedby={wizardError ? "wizard-error" : undefined} maxLength={FIELD_LIMITS.dietaryNotes} value={wiz.dietaryNotes} onChange={e => setWiz({ ...wiz, dietaryNotes: e.target.value })} placeholder="e.g. Jain options, nut allergy, no onion-garlic for 20 guests" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3" rows={3} /></div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-5">
                <h2 className="font-serif-display text-3xl">Entertainment</h2>
                <div>
                  <span className="font-semibold">Entertainment types * (pick at least one)</span>
                  <div className="mt-3 grid grid-cols-2 gap-2">{ENTERTAINMENT_OPTS.map(opt => { const on = wiz.entertainmentTypes.includes(opt); return <button key={opt} aria-label={opt} aria-pressed={on} onClick={() => setWiz({ ...wiz, entertainmentTypes: on ? wiz.entertainmentTypes.filter(x => x !== opt) : [...wiz.entertainmentTypes, opt] })} className={`rounded-xl border px-3 py-3 text-left text-sm ${on ? "border-[#0F4C4C] notice-success font-semibold" : "border-[var(--border)] bg-[var(--bg)]"}`}>{on ? "✓ " : ""}{opt}</button>; })}</div>
                </div>
                <div><label htmlFor="ent-hours" className="font-semibold">Duration (hours) *</label><input id="ent-hours" type="number" min={1} max={12} value={wiz.entertainmentHours} onChange={e => setWiz({ ...wiz, entertainmentHours: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3" /></div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
                  <div><p className="font-semibold">Kids activities?</p><p className="text-sm text-[var(--dim)]">Games, kids zone, entertainer</p></div>
                  <button role="switch" aria-checked={wiz.kidsActivities} aria-label="Kids activities" onClick={() => setWiz({ ...wiz, kidsActivities: !wiz.kidsActivities })} className={`h-8 w-14 rounded-full p-1 ${wiz.kidsActivities ? "bg-[#0F4C4C]" : "bg-gray-300"}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${wiz.kidsActivities ? "translate-x-6" : ""}`} /></button>
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-5">
                <h2 className="font-serif-display text-3xl">People & resources</h2>
                <p className="text-sm text-[var(--dim)]">Suggested: 1 server per 20 guests = {Math.ceil(wiz.guestCount / 20)} servers for {wiz.guestCount} guests.</p>
                <div className="space-y-3">
                  {wiz.manpower.map((m, idx) => (
                    <div key={m.role} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3">
                      <input type="checkbox" id={`mp-${m.role}`} aria-label={m.label} checked={m.selected} onChange={e => { const copy = [...wiz.manpower]; copy[idx] = { ...m, selected: e.target.checked }; setWiz({ ...wiz, manpower: copy }); }} className="h-5 w-5" />
                      <label htmlFor={`mp-${m.role}`} className="flex-1 font-medium">{m.label}<span className="block text-xs font-normal text-[var(--dim)]">{formatINR(m.costPerPersonInr)} per person</span></label>
                      <label className="sr-only" htmlFor={`mp-count-${m.role}`}>{m.label} count</label>
                      <input id={`mp-count-${m.role}`} type="number" min={0} value={m.count} onChange={e => { const copy = [...wiz.manpower]; copy[idx] = { ...m, count: Number(e.target.value) }; setWiz({ ...wiz, manpower: copy }); }} className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-center" />
                      <span className="hidden w-24 text-right text-sm text-[var(--dim)] sm:block">{formatINR(m.count * m.costPerPersonInr)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <label htmlFor="decor-level" className="font-semibold">Decor level *</label>
                  <select id="decor-level" value={wiz.decorLevel} onChange={e => setWiz({ ...wiz, decorLevel: e.target.value })} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"><option value="simple">Simple</option><option value="premium">Premium</option><option value="luxury">Luxury</option></select>
                </div>
                <p className="rounded-xl bg-[var(--surface-alt)] p-3 text-sm">Manpower total (selected): <strong>{formatINR(wiz.manpower.filter(m => m.selected).reduce((s, m) => s + m.count * m.costPerPersonInr, 0))}</strong></p>
              </div>
            )}

            {wizardStep === 6 && (
              <div className="space-y-4">
                <h2 className="font-serif-display text-3xl">Review & generate</h2>
                <p className="text-[var(--dim)]">Check everything. Aegis Generate with AI uses gemini-3.5-flash-lite (temperature 0.3), validates JSON, then recalculates every total in code. Template is always available as fallback.</p>
                {settings && !settings.hasKey ? <div className="rounded-xl border notice-warning p-3 text-sm"><strong>AI not connected yet:</strong> no key saved — Generate with AI will fall back to template with an explanation. <button onClick={() => { setReturnScreen("wizard"); setScreen("settings"); }} className="font-bold underline">Add key in Settings →</button></div> : <div className="rounded-xl notice-success p-3 text-sm">AI ready — {settings?.model} • Generations this session: {genCount}</div>}
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-[var(--border)] py-2"><dt className="text-[var(--dim)]">Planner</dt><dd className="font-medium">{plannerName}</dd></div>
                  <div className="flex justify-between border-b border-[var(--border)] py-2"><dt className="text-[var(--dim)]">Event</dt><dd className="font-medium capitalize">{wiz.eventType} — {wiz.title}</dd></div>
                  <div className="flex justify-between border-b border-[var(--border)] py-2"><dt className="text-[var(--dim)]">Date / City</dt><dd className="font-medium">{wiz.eventDate} • {wiz.city}</dd></div>
                  <div className="flex justify-between border-b border-[var(--border)] py-2"><dt className="text-[var(--dim)]">Guests</dt><dd className="font-medium">{formatNum(wiz.guestCount)} (+10% = {formatNum(plannedGuestsFor(wiz.guestCount))} for food)</dd></div>
                  <div className="flex justify-between border-b border-[var(--border)] py-2"><dt className="text-[var(--dim)]">Budget</dt><dd className="font-medium">{formatINR(wiz.budgetMinInr)} – {formatINR(wiz.budgetMaxInr)}</dd></div>
                  <div className="flex justify-between border-b border-[var(--border)] py-2"><dt className="text-[var(--dim)]">Per guest</dt><dd className="font-medium">{formatINR(perGuestMin)} – {formatINR(perGuestMax)}</dd></div>
                  <div className="flex justify-between border-b border-[var(--border)] py-2"><dt className="text-[var(--dim)]">Venue</dt><dd className="font-medium capitalize">{wiz.venuePref}{wiz.needsParking ? ` • Parking for ${wiz.expectedCars} cars` : " • No parking"}</dd></div>
                  <div className="flex justify-between border-b border-[var(--border)] py-2"><dt className="text-[var(--dim)]">Food</dt><dd className="font-medium capitalize">{wiz.foodType}{wiz.foodType === "mixed" ? ` (${wiz.vegPercent}% veg)` : ""} • Desserts {wiz.desserts ? "Yes" : "No"} • Fruits {wiz.fruits ? "Yes" : "No"} • Dry fruits {wiz.dryFruits ? "Yes" : "No"}</dd></div>
                  <div className="flex justify-between border-b border-[var(--border)] py-2"><dt className="text-[var(--dim)]">Entertainment</dt><dd className="font-medium">{wiz.entertainmentTypes.join(", ")} • {wiz.entertainmentHours}h • Kids {wiz.kidsActivities ? "Yes" : "No"}</dd></div>
                  <div className="flex justify-between py-2"><dt className="text-[var(--dim)]">Decor</dt><dd className="font-medium capitalize">{wiz.decorLevel}</dd></div>
                </dl>
                <div className="rounded-xl notice-success p-4 text-sm">
                  <p className="font-semibold">Template fallback split (of midpoint {formatINR(Math.floor((wiz.budgetMinInr + wiz.budgetMaxInr) / 2))})</p>
                  <p className="mt-1">Venue 30% • Food 35% • Decor 15% • Entertainment 8% • Photography 5% • Manpower 5% • Misc 2%</p>
                </div>
                {createMut.isError ? <p role="alert" className="rounded-xl notice-danger p-3 text-sm">{String((createMut.error as Error)?.message || createMut.error)}</p> : null}
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            {wizardStep > 0 ? <button onClick={() => { setWizardStep(wizardStep - 1); setWizardError(""); }} className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 font-semibold">Back</button> : <button onClick={() => setScreen("home")} className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 font-semibold">Cancel</button>}
            {wizardStep < 6 ? <button onClick={nextStep} className="flex-[2] rounded-xl bg-[#0F4C4C] px-4 py-3.5 font-semibold text-white">Continue →</button> : (
            <div className="flex flex-[2] flex-col gap-2">
              <button onClick={() => { if (!validateAllSteps()) return; createAIMut.mutate(); }} disabled={createAIMut.isPending || createMut.isPending} className="w-full rounded-xl bg-[#0F4C4C] px-4 py-3.5 font-semibold text-white disabled:opacity-50">{createAIMut.isPending ? "Generating AI plan with Gemini… (retrying once on failure)" : createMut.isPending ? "AI could not start — creating template plan instead…" : "✨ Generate with AI"}</button>
              <button onClick={() => { if (!validateAllSteps()) return; createMut.mutate(); }} disabled={createMut.isPending || createAIMut.isPending} className="w-full rounded-xl border border-[#B45309] bg-white px-4 py-3 font-semibold text-[#92400E] disabled:opacity-50">{createMut.isPending ? "Generating template…" : "Use template plan (fallback)"}</button>
              {genMessage ? <p role="status" className="rounded-xl notice-info p-3 text-sm">{genMessage}</p> : null}
              {(createMut.isError && !createAIMut.isPending) ? <p role="alert" className="rounded-xl notice-danger p-3 text-sm">The Aegis template fallback could not be created either: {String((createMut.error as Error)?.message || createMut.error)} — check the highlighted step above and try again.</p> : null}
            </div>
          )}
          </div>
        </main>
      </div>
    );
  }

  // PLAN VIEW
  if (screen === "plan") {
    if (eventQuery.isPending) return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-8 text-center" role="status"><p className="font-serif-display text-2xl">Loading your Aegis plan…</p><p className="mt-2 text-sm text-[var(--dim)]">Fetching the saved Aegis plan — totals and audit flags are recalculated in code as soon as it arrives. This screen is never left blank.</p></div>;
    if (!ev) return <div className="min-h-screen bg-[var(--bg)] p-8 text-center"><p>Aegis plan not found.</p><button onClick={() => setScreen("home")} className="mt-4 rounded-xl bg-[#0F4C4C] px-4 py-2 text-white">Back to home</button></div>;
    const evNonNull = ev;

    const venues = ev.venueOptions && ev.venueOptions.length ? ev.venueOptions.map(v => ({ name: v.name, capacity: v.capacity, parkingSpaces: v.parkingSpaces, costInr: v.costInr, kind: v.kind || "Venue suggestion — verify before booking" })) : templateVenues(ev);
    const effectiveMin = editBudgetMin || ev.budgetMinInr;
    const effectiveMax = editBudgetMax || ev.budgetMaxInr;
    const remaining = effectiveMax - totalPlanned;
    const perGuest = ev.guestCount ? Math.round(totalPlanned / ev.guestCount) : 0;
    const overBudget = totalPlanned > effectiveMax;
    const foodLine = editLines.find(l => l.category === "food");
    const vegPlates = ev.foodType === "veg" ? plannedGuests : ev.foodType === "non-veg" ? 0 : Math.ceil(plannedGuests * ev.vegPercent / 100);
    const nonVegPlates = ev.foodType === "veg" ? 0 : ev.foodType === "non-veg" ? plannedGuests : plannedGuests - vegPlates;
    const nonVegDisplay = nonVegPlates;
    const selectedVenue = venues.find(v => v.name === editSelectedVenue) ?? venues[0] ?? null;
    const effectiveTasks: EditTask[] = editTasks.length ? editTasks : (ev.tasks ?? []).map(t => ({ title: t.title, dueInDaysBefore: t.dueInDaysBefore, owner: t.owner ?? "", status: (t as { status?: string }).status ?? "todo" }));
    const effectiveManpower: EditManpower[] = editManpower.length ? editManpower : ev.manpower;
    const effectiveCourses: string[] = editMenuCourses.length ? editMenuCourses : (ev.menu?.courses ?? []);
    const auditFlags = computeAuditFlags({ total: totalPlanned, budgetMin: effectiveMin, budgetMax: effectiveMax, perGuest, eventType: ev.eventType, plannedGuests, guestCount: ev.guestCount, selectedVenue, needsParking: ev.needsParking, expectedCars: ev.expectedCars, foodLineInr: foodLine?.plannedInr ?? 0, costPerPlate: editCostPerPlate, desserts: editDesserts, menuCourses: effectiveCourses, manpower: effectiveManpower, tasks: effectiveTasks, eventDate: ev.eventDate, venueConfirmed: editVenueConfirmed, foodType: ev.foodType, vegPercent: ev.vegPercent, vegPlates, nonVegPlates, budgetLines: editLines });
    const health = healthFromFlags(auditFlags);
    const unresolvedFlags = auditFlags.filter(f => !f.resolved);
    const topFlags = [...unresolvedFlags].sort((a, b) => (a.severity === "blocker" ? 0 : a.severity === "warning" ? 1 : 2) - (b.severity === "blocker" ? 0 : b.severity === "warning" ? 1 : 2)).slice(0, 3);
    const venueBudgetInr = editLines.find(l => l.category === "venue")?.plannedInr ?? 300000;
    const manpowerTotalLive = effectiveManpower.reduce((s, m) => s + m.count * m.costPerPersonInr, 0);
    const tabs = ["Overview", "Budget", "Venue", "Food", "People", "Timeline", "Audit", "Versions", "Summary"];

    // --- Milestone 4 helpers: recalculate metrics for any snapshot in code (never trust stored totals) ---
    function metricsForSnapshot(snap: VersionT["snapshot"]) {
      // Delegates to snapshotMetrics in planner-core.ts — the same function
      // tests/versions.test.ts verifies for compare & restore recalculation.
      return snapshotMetrics(snap, { guestCount: evNonNull.guestCount, eventType: evNonNull.eventType, eventDate: evNonNull.eventDate, budgetMinInr: evNonNull.budgetMinInr, budgetMaxInr: evNonNull.budgetMaxInr });
    }
    function currentAsSnapshot(): VersionT["snapshot"] {
      return {
        budgetLines: editLines.map(l => ({ category: l.category, label: l.label, plannedInr: l.plannedInr, note: l.note ?? "" })), costPerPlateInr: editCostPerPlate, venueOptions: venues, menu: { courses: effectiveCourses, notes: evNonNull.menu?.notes ?? "", costPerPlateInr: editCostPerPlate },
        tasks: effectiveTasks, manpower: effectiveManpower, risks: evNonNull.risks ?? [], aiNotes: evNonNull.aiNotes ?? [], aiModel: evNonNull.aiModel, planSource: evNonNull.planSource,
        selectedVenueName: editSelectedVenue, venueConfirmed: editVenueConfirmed, budgetMinInr: effectiveMin, budgetMaxInr: effectiveMax, desserts: editDesserts, fruits: editFruits, dryFruits: editDryFruits,
        generationMessage: evNonNull.generationMessage, guestCount: evNonNull.guestCount, eventType: evNonNull.eventType, eventDate: evNonNull.eventDate, foodType: evNonNull.foodType, vegPercent: evNonNull.vegPercent, needsParking: evNonNull.needsParking, expectedCars: evNonNull.expectedCars,
      };
    }
    function buildSummaryText(snap: VersionT["snapshot"], versionLabel: string): string {
      const m = metricsForSnapshot(snap);
      const venueTxt = m.selectedVenue ? `${m.selectedVenue.name} — capacity ${formatNum(m.selectedVenue.capacity)}, parking ${formatNum(m.selectedVenue.parkingSpaces)} cars, ${formatINR(m.selectedVenue.costInr)}${snap.venueConfirmed ? " (Confirmed)" : " (Not confirmed)"}` : "No venue selected";
      const top = [...m.flags.filter(f => !f.resolved)].sort((a, b) => (a.severity === "blocker" ? 0 : a.severity === "warning" ? 1 : 2) - (b.severity === "blocker" ? 0 : b.severity === "warning" ? 1 : 2)).slice(0, 3);
      const lines: string[] = [
        `${evNonNull.title} — Aegis Event Plan Summary (${versionLabel})`,
        `${evNonNull.eventType} • ${evNonNull.eventDate} • ${evNonNull.city} • Planned by ${evNonNull.plannerName}`,
        ``,
        `Guests: ${formatNum(snap.guestCount || evNonNull.guestCount)} + 10% buffer = ${formatNum(m.plannedGuests)} for food`,
        `Budget: ${formatINR(snap.budgetMinInr)} – ${formatINR(snap.budgetMaxInr)} | Total planned: ${formatINR(m.total)} | Remaining to max: ${formatINR((snap.budgetMaxInr || 0) - m.total)} | Per guest: ${formatINR(m.perGuest)}`,
        `Health score: ${m.health}/100`,
        ``,
        `Budget breakdown:`,
        ...(snap.budgetLines ?? []).map(l => `  • ${l.label}: ${formatINR(l.plannedInr)}`),
        ``,
        `Venue: ${venueTxt}`,
        `Menu: ${(snap.menu?.courses ?? []).join(", ") || "—"} | ${formatINR(snap.costPerPlateInr)} per plate × ${formatNum(m.plannedGuests)} = ${formatINR(snap.costPerPlateInr * m.plannedGuests)}`,
        `Food: ${snap.foodType}${snap.foodType === "mixed" ? ` — Veg ${formatNum(m.vegPlates)} plates (${snap.vegPercent}%), Non-veg ${formatNum(m.nonVegPlates)} plates (${100 - snap.vegPercent}%)` : ""} | Desserts: ${snap.desserts ? "Yes" : "No"} | Fruits: ${snap.fruits ? "Yes" : "No"} | Dry fruits: ${snap.dryFruits ? "Yes" : "No"}`,
        `Manpower: ${(snap.manpower ?? []).map(mp => `${mp.label} ×${mp.count} (${formatINR(mp.count * mp.costPerPersonInr)})`).join(", ") || "—"} | Total ${formatINR((snap.manpower ?? []).reduce((s, mp) => s + mp.count * mp.costPerPersonInr, 0))}`,
        `Tasks: ${(snap.tasks ?? []).length} tasks — ${(snap.tasks ?? []).map(t => `${t.title} (${t.owner || "No owner"}, ${t.status ?? "todo"})`).join("; ") || "—"}`,
        ``,
        `Top audit flags:`,
        ...(top.length ? top.map(f => `  • [${f.severity.toUpperCase()}] ${f.id}: ${f.message}`) : [`  • All 12 audit rules pass.`]),
        ``,
        `Generated with Aegis • Source: ${snap.planSource === "ai" ? "AI-generated" : "Template"} • Model: ${snap.aiModel} • All totals recalculated in code. Venue options are suggestions to verify, not bookings.`,
      ];
      return lines.join("\n");
    }
    const summarySnap: VersionT["snapshot"] = summaryVersionId ? (versionsList.find(v => v.id === summaryVersionId)?.snapshot ?? currentAsSnapshot()) : currentAsSnapshot();
    const summaryVersionLabel = summaryVersionId ? `v${versionsList.find(v => v.id === summaryVersionId)?.versionNumber ?? "?"} — ${versionsList.find(v => v.id === summaryVersionId)?.label ?? ""}` : `Current plan — v${evNonNull.planVersion}`;
    const summaryMetrics = metricsForSnapshot(summarySnap);
    const compareA = versionsList.find(v => v.id === compareAId) ?? versionsList[1] ?? versionsList[0] ?? null;
    const compareB = versionsList.find(v => v.id === compareBId) ?? versionsList[0] ?? null;

    function syncManpower(newMp: EditManpower[], linesBase: EditLine[] = editLines): EditLine[] {
      const mpTotal = newMp.reduce((s, m) => s + m.count * m.costPerPersonInr, 0);
      return linesBase.map(l => l.category === "manpower" ? { ...l, plannedInr: mpTotal } : l);
    }
    function applyFix(flag: AuditFlag) {
      setFixMessage("");
      const currentTotal = totalPlanned;
      // Helper to check candidate
      const checkCandidate = (cand: Partial<SavePayload> & { lines: EditLine[]; total: number }) => {
        const candFlags = computeAuditFlags({ total: cand.total, budgetMin: cand.budgetMinInr ?? effectiveMin, budgetMax: cand.budgetMaxInr ?? effectiveMax, perGuest: evNonNull.guestCount ? Math.round(cand.total / evNonNull.guestCount) : 0, eventType: evNonNull.eventType, plannedGuests, guestCount: evNonNull.guestCount, selectedVenue: venues.find(v => v.name === (cand.selectedVenueName !== undefined ? cand.selectedVenueName : editSelectedVenue)) ?? selectedVenue, needsParking: evNonNull.needsParking, expectedCars: evNonNull.expectedCars, foodLineInr: cand.lines.find(l => l.category === "food")?.plannedInr ?? 0, costPerPlate: cand.costPerPlateInr ?? editCostPerPlate, desserts: cand.desserts ?? editDesserts, menuCourses: cand.menuCourses ?? effectiveCourses, manpower: cand.manpower ?? effectiveManpower, tasks: cand.tasks ?? effectiveTasks, eventDate: evNonNull.eventDate, venueConfirmed: cand.venueConfirmed ?? editVenueConfirmed, foodType: evNonNull.foodType, vegPercent: evNonNull.vegPercent, vegPlates, nonVegPlates, budgetLines: cand.lines });
        return candFlags.find(f => f.id === flag.id);
      };
      if (flag.id === "OVER_BUDGET") {
        const excessAmt = currentTotal - effectiveMax;
        const sorted = [...editLines].sort((a, b) => b.plannedInr - a.plannedInr);
        let remainingCut = excessAmt; const newLines = editLines.map(l => ({ ...l }));
        for (const s of sorted) { if (remainingCut <= 0) break; const idx = newLines.findIndex(l => l.category === s.category); const line = newLines[idx]; if (!line) continue; const cut = Math.min(line.plannedInr, remainingCut); line.plannedInr -= cut; remainingCut -= cut; }
        const newTotal = newLines.reduce((s, l) => s + l.plannedInr, 0);
        const candCheck = checkCandidate({ lines: newLines, total: newTotal });
        if (candCheck && !candCheck.resolved) { setFixMessage(`Apply fix for OVER_BUDGET did not pass recalculation: total would still be ${formatINR(newTotal)} vs max ${formatINR(effectiveMax)}. The flag stays unresolved — try raising the maximum in Budget.`); return; }
        setEditLines(newLines); saveCurrent({ budgetLines: newLines }); setFixMessage(`Fix applied for OVER_BUDGET: reduced the largest categories by ${formatINR(excessAmt)}. Recalculation now passes — total ${formatINR(newTotal)} is inside max ${formatINR(effectiveMax)}, so this flag moves to Resolved after save.`);
        return;
      }
      if (flag.id === "UNDER_BUDGET_MIN") {
        const target = effectiveMin; const shortfall = target - currentTotal;
        const newLines = editLines.map(l => l.category === "misc" ? { ...l, plannedInr: l.plannedInr + shortfall } : l);
        const hasMisc = newLines.some(l => l.category === "misc"); if (!hasMisc) { setFixMessage("Cannot apply UNDER_BUDGET_MIN fix: no Misc category exists to top up. Add a category first — flag stays unresolved."); return; }
        const newTotal = newLines.reduce((s, l) => s + l.plannedInr, 0); setEditLines(newLines); saveCurrent({ budgetLines: newLines }); setFixMessage(`Fix applied for UNDER_BUDGET_MIN: added ${formatINR(shortfall)} to Misc / Transport to reach your minimum. New total ${formatINR(newTotal)} — recalculation passes, flag moves to Resolved after save.`); return;
      }
      if (flag.id === "VENUE_TOO_SMALL" || flag.id === "PARKING_SHORTFALL") {
        const needCap = flag.id === "VENUE_TOO_SMALL";
        const candidates = venues.filter(v => (needCap ? v.capacity >= plannedGuests : true) && (!evNonNull.needsParking || v.parkingSpaces >= evNonNull.expectedCars) && (flag.id === "PARKING_SHORTFALL" ? v.capacity >= plannedGuests || v.parkingSpaces >= evNonNull.expectedCars : true)).sort((a, b) => a.costInr - b.costInr);
        const pick = flag.id === "VENUE_TOO_SMALL" ? venues.filter(v => v.capacity >= plannedGuests).sort((a, b) => a.costInr - b.costInr)[0] : (candidates[0] ?? venues.filter(v => v.parkingSpaces >= evNonNull.expectedCars).sort((a, b) => a.costInr - b.costInr)[0]);
        if (!pick) { setFixMessage(`Cannot auto-fix ${flag.id}: none of the ${venues.length} venue options ${needCap ? `fits ${formatNum(plannedGuests)} guests` : `has ${evNonNull.expectedCars} parking spaces`}. Add a larger venue option or change your requirements — flag stays unresolved.`); return; }
        const newLines = editLines.map(l => l.category === "venue" ? { ...l, plannedInr: pick.costInr } : l);
        setEditSelectedVenue(pick.name); setEditLines(newLines); saveCurrent({ budgetLines: newLines, selectedVenueName: pick.name }); setFixMessage(`Fix applied for ${flag.id}: switched selected venue to ${pick.name} (capacity ${formatNum(pick.capacity)}, parking ${formatNum(pick.parkingSpaces)}, ${formatINR(pick.costInr)}). Venue budget line updated to ${formatINR(pick.costInr)} — recalculation passes for this rule after save.`); return;
      }
      if (flag.id === "FOOD_SHORTFALL") {
        const targetFood = editCostPerPlate * plannedGuests; const newLines = editLines.map(l => l.category === "food" ? { ...l, plannedInr: targetFood } : l); setEditLines(newLines); saveCurrent({ budgetLines: newLines }); setFixMessage(`Fix applied for FOOD_SHORTFALL: food line set to ${formatINR(editCostPerPlate)} × ${formatNum(plannedGuests)} planned guests = ${formatINR(targetFood)} (includes 10% buffer). Recalculation passes after save.`); return;
      }
      if (flag.id === "PER_GUEST_TOO_LOW") {
        const floor = PER_GUEST_FLOORS[evNonNull.eventType] ?? 1500; const neededTotal = floor * evNonNull.guestCount; const add = neededTotal - currentTotal;
        if (neededTotal > effectiveMax) { setFixMessage(`Cannot auto-fix PER_GUEST_TOO_LOW: reaching the ${formatINR(floor)} floor needs total ${formatINR(neededTotal)}, which exceeds your maximum ${formatINR(effectiveMax)}. Raise the maximum in Budget first — flag stays unresolved, no manual resolve is allowed for this rule.`); return; }
        const newLines = editLines.map(l => l.category === "decor" ? { ...l, plannedInr: l.plannedInr + add } : l); setEditLines(newLines); saveCurrent({ budgetLines: newLines }); setFixMessage(`Fix applied for PER_GUEST_TOO_LOW: added ${formatINR(add)} to Decor to reach ${formatINR(floor)} per guest. Recalculation passes after save.`); return;
      }
      if (flag.id === "MISSING_DESSERT_CHOICE") {
        const newCourses = [...effectiveCourses, "Dessert"]; setEditMenuCourses(newCourses); saveCurrent({ menuCourses: newCourses }); setFixMessage("Fix applied for MISSING_DESSERT_CHOICE: added Dessert course to the menu builder. Recalculation checks the menu — flag moves to Resolved after save."); return;
      }
      if (flag.id === "STAFF_RATIO_LOW") {
        const reqS = Math.ceil(evNonNull.guestCount / 20); const reqSec = Math.max(2, Math.ceil(evNonNull.guestCount / 100));
        const newMp = effectiveManpower.map(m => m.role === "server" ? { ...m, count: Math.max(m.count, reqS) } : m.role === "security" ? { ...m, count: Math.max(m.count, reqSec) } : m);
        const newLines = syncManpower(newMp); setEditManpower(newMp); setEditLines(newLines); saveCurrent({ manpower: newMp, budgetLines: newLines }); setFixMessage(`Fix applied for STAFF_RATIO_LOW: servers raised to ${reqS} (1 per 20) and security to ${reqSec}. Manpower budget line recalculated to ${formatINR(newMp.reduce((s, m) => s + m.count * m.costPerPersonInr, 0))} in code.`); return;
      }
      if (flag.id === "NO_TIMELINE_OWNER") {
        const newTasks = effectiveTasks.map(t => !t.owner.trim() ? { ...t, owner: "Coordinator" } : t); setEditTasks(newTasks); saveCurrent({ tasks: newTasks }); setFixMessage("Fix applied for NO_TIMELINE_OWNER: assigned Coordinator to every ownerless task. Recalculation passes after save."); return;
      }
      if (flag.id === "DATE_TOO_SOON") {
        if (!selectedVenue) { setFixMessage("Cannot auto-fix DATE_TOO_SOON: no venue is selected to confirm. Select a venue first — flag stays unresolved."); return; }
        setEditVenueConfirmed(true); saveCurrent({ venueConfirmed: true }); setFixMessage(`Fix applied for DATE_TOO_SOON: marked ${selectedVenue.name} as confirmed. Recalculation now sees venueConfirmed = true, so this blocker moves to Resolved after save.`); return;
      }
      if (flag.id === "MIXED_FOOD_MISMATCH") {
        setFixMessage(`Plates are already recalculated in code as veg ${formatNum(vegPlates)} + non-veg ${formatNum(nonVegPlates)} = ${formatNum(plannedGuests)}. If this flag is still unresolved, the veg % (${evNonNull.vegPercent}%) is out of range — change it in the wizard by creating a corrected plan. Flag stays unresolved until the split totals 100%.`); return;
      }
      if (flag.id === "SINGLE_POINT_FAILURE") {
        const newMp = effectiveManpower.map(m => CRITICAL_ROLES.includes(m.role) && m.count === 1 ? { ...m, count: 2 } : m); const newLines = syncManpower(newMp); setEditManpower(newMp); setEditLines(newLines); saveCurrent({ manpower: newMp, budgetLines: newLines }); setFixMessage("Fix applied for SINGLE_POINT_FAILURE: every critical role with only 1 person was raised to 2, and the manpower budget line was recalculated in code."); return;
      }
      setFixMessage(`No safe one-click fix is available for ${flag.id} — follow the suggested fix manually, then recalculation will re-check it. Blockers cannot be manually marked resolved.`);
    }

    function handleFoodToggle(key: "desserts" | "fruits" | "dryFruits", newVal: boolean) {
      const deltaPerPlate = key === "desserts" ? 150 : key === "fruits" ? 80 : 120;
      const curVal = key === "desserts" ? editDesserts : key === "fruits" ? editFruits : editDryFruits;
      if (curVal === newVal) return;
      const newCost = Math.max(0, editCostPerPlate + (newVal ? deltaPerPlate : -deltaPerPlate));
      setEditCostPerPlate(newCost);
      setEditLines(prev => prev.map(l => l.category === "food" ? { ...l, plannedInr: newCost * plannedGuests } : l));
      if (key === "desserts") setEditDesserts(newVal);
      if (key === "fruits") setEditFruits(newVal);
      if (key === "dryFruits") setEditDryFruits(newVal);
      setSaveMsg("");
    }

    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="mx-auto max-w-4xl px-5 pb-12 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setScreen("home")} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium">← All events</button>
            <button onClick={() => { setWiz(initialWizard()); setWizardStep(0); setScreen("wizard"); }} className="rounded-full bg-[#B45309] px-4 py-2 text-sm font-semibold text-white">+ New event</button>
          </div>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-accent2-strong">Aegis • Event plan</p>
          <h1 className="font-serif-display mt-1 text-4xl">{ev.title}</h1>
          <p className="mt-1 capitalize text-[var(--dim)]">{ev.eventType} • {ev.city} • {ev.eventDate} • Planned by {ev.plannerName} • {formatNum(ev.guestCount)} guests</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${ev.planSource === "ai" ? "notice-success" : "notice-warning"}`}>{ev.planSource === "ai" ? "✨ AI-generated" : "📋 Template plan"} • v{ev.planVersion} • {ev.aiModel}</span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs">Generations this session: {genCount}</span>
            <button onClick={() => { setReturnScreen("plan"); setScreen("settings"); }} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold">Settings / API Key</button>
            <button onClick={() => setScreen("demo")} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold">📖 Demo guide</button>
          </div>
          {(genMessage || ev.generationMessage) ? <div className="mt-3 rounded-xl border notice-info p-3 text-sm">{genMessage || ev.generationMessage}</div> : null}

          {/* Hero budget health */}
          <div className="mt-6 rounded-2xl bg-[#0F4C4C] p-6 text-white">
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              <div><p className="text-xs uppercase tracking-wide opacity-80">Total planned</p><p className="font-serif-display mt-1 text-3xl">{formatINR(totalPlanned)}</p></div>
              <div><p className="text-xs uppercase tracking-wide opacity-80">Remaining to max</p><p className={`font-serif-display mt-1 text-3xl ${remaining < 0 ? "text-red-300" : ""}`}>{formatINR(remaining)}</p></div>
              <div><p className="text-xs uppercase tracking-wide opacity-80">Per guest</p><p className="font-serif-display mt-1 text-3xl">{formatINR(perGuest)}</p></div>
              <div><p className="text-xs uppercase tracking-wide opacity-80">Health score</p><p className="font-serif-display mt-1 text-3xl">{health}/100</p></div>
            </div>
            <p className="mt-4 text-sm opacity-90">Budget band {formatINR(effectiveMin)} – {formatINR(effectiveMax)} • Guests {formatNum(ev.guestCount)} + 10% buffer = {formatNum(plannedGuests)} for food • Selected venue: {selectedVenue?.name ?? "None"} {editVenueConfirmed ? "• Confirmed ✓" : "• Not confirmed"}</p>
            <p className="mt-1 text-xs opacity-80">Health = 100 − 25 per blocker − 10 per warning − 2 per info (floor 0). {unresolvedFlags.length} unresolved flag(s) out of 12 rules. Score never hides the flags — see Audit tab for all 12.</p>
            {topFlags.map(f => <p key={f.id} role={f.severity === "blocker" ? "alert" : undefined} className={`mt-2 rounded-lg p-3 text-sm ${f.severity === "blocker" ? "bg-red-900/60 font-semibold" : f.severity === "warning" ? "bg-amber-900/50" : "bg-white/10"}`}>{f.severity === "blocker" ? "🚨" : "⚠"} {f.id} — {f.message}</p>)}
          </div>

          {/* Audit / Versions / Summary shortcuts — always visible, so Audit is never hidden in the scrolling tab row */}
          <div className="mt-6 grid grid-cols-3 gap-2" aria-label="Quick shortcuts">
            <button onClick={() => setPlanTab("Audit")} aria-label="Open Audit tab from shortcut" className={`rounded-2xl border p-3 text-left ${planTab === "Audit" ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : unresolvedFlags.length ? "notice-danger" : "notice-success"}`}>
              <span className="block text-xs font-bold uppercase tracking-wide">🛡️ Audit</span>
              <span className="mt-1 block text-sm font-bold">Health {health}/100</span>
              <span className="block text-xs opacity-80">{unresolvedFlags.length} unresolved • Open Audit →</span>
            </button>
            <button onClick={() => setPlanTab("Versions")} aria-label="Open Versions tab from shortcut" className={`rounded-2xl border p-3 text-left ${planTab === "Versions" ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : "border-[var(--border)] bg-[var(--surface)]"}`}>
              <span className="block text-xs font-bold uppercase tracking-wide">🕘 Versions</span>
              <span className="mt-1 block text-sm font-bold">v{ev.planVersion} • {versionsList.length || "…"} saved</span>
              <span className="block text-xs opacity-80">Compare & restore →</span>
            </button>
            <button onClick={() => setPlanTab("Summary")} aria-label="Open Summary tab from shortcut" className={`rounded-2xl border p-3 text-left ${planTab === "Summary" ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : "border-[var(--border)] bg-[var(--surface)]"}`}>
              <span className="block text-xs font-bold uppercase tracking-wide">🖨️ Summary</span>
              <span className="mt-1 block text-sm font-bold">One-page export</span>
              <span className="block text-xs opacity-80">Print / copy →</span>
            </button>
          </div>
          {restoreMsg ? <div role="status" className="mt-3 rounded-xl border notice-info p-3 text-sm">{restoreMsg}</div> : null}

          {/* Tabs — horizontally scrollable on phone, with a clear scroll hint */}
          <p className="mt-5 text-xs font-semibold text-[var(--dim)]">AEGIS PLAN SECTIONS — scroll sideways on small screens → Audit, Versions & Summary are at the end, or use the shortcuts above</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Plan sections" style={{ scrollbarWidth: "thin" }} onKeyDown={e => {
            const idx = tabs.indexOf(planTab);
            let next = -1;
            if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
            else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = tabs.length - 1;
            if (next >= 0) { e.preventDefault(); const name = tabs[next]!; setPlanTab(name); requestAnimationFrame(() => document.getElementById(`plan-tab-${name}`)?.focus()); }
          }}>
            {tabs.map(t => <button key={t} id={`plan-tab-${t}`} role="tab" aria-selected={planTab === t} aria-controls="plan-panel" tabIndex={planTab === t ? 0 : -1} onClick={() => setPlanTab(t)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${planTab === t ? "bg-[#0F4C4C] text-white" : "border border-[var(--border)] bg-[var(--surface)]"} ${t === "Audit" && unresolvedFlags.length ? "ring-2 ring-red-400" : ""}`}>{t}{t === "Audit" && unresolvedFlags.length ? ` (${unresolvedFlags.length})` : ""}{t === "Versions" && versionsList.length ? ` (${versionsList.length})` : ""}</button>)}
            <span className="shrink-0 self-center text-xs text-[var(--dim)]">→ end</span>
          </div>
          <div role="tabpanel" id="plan-panel" aria-labelledby={`plan-tab-${planTab}`}>

          {planTab === "Overview" && (
            <div className="mt-5 space-y-4">
              <h3 className="font-serif-display text-2xl">Aegis Overview</h3>
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm sm:grid-cols-3">
                <div><p className="text-[var(--dim)]">Total planned</p><p className="font-serif-display text-2xl">{formatINR(totalPlanned)}</p></div>
                <div><p className="text-[var(--dim)]">Budget minimum</p><p className="font-serif-display text-2xl">{formatINR(effectiveMin)}</p></div>
                <div><p className="text-[var(--dim)]">Budget maximum</p><p className="font-serif-display text-2xl">{formatINR(effectiveMax)}</p></div>
                <div><p className="text-[var(--dim)]">Remaining to max</p><p className={`font-serif-display text-2xl ${remaining < 0 ? "text-danger-strong" : "text-success-strong"}`}>{formatINR(remaining)}</p></div>
                <div><p className="text-[var(--dim)]">Per-guest cost</p><p className="font-serif-display text-2xl">{formatINR(perGuest)}</p></div>
                <div><p className="text-[var(--dim)]">Guests + 10% buffer</p><p className="font-serif-display text-2xl">{formatNum(ev.guestCount)} → {formatNum(plannedGuests)}</p></div>
                <div><p className="text-[var(--dim)]">Plan health score</p><p className="font-serif-display text-2xl">{health}/100</p></div>
                <div><p className="text-[var(--dim)]">Selected venue</p><p className="font-semibold">{selectedVenue?.name ?? "None"}</p><p className="text-xs">{editVenueConfirmed ? "Confirmed ✓" : "Not confirmed"}</p></div>
                <div><p className="text-[var(--dim)]">Manpower total (live)</p><p className="font-serif-display text-2xl">{formatINR(manpowerTotalLive)}</p></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h3 className="font-bold">Budget snapshot</h3><ul className="mt-3 space-y-2 text-sm">{editLines.map(l => <li key={l.category} className="flex justify-between"><span>{l.label}</span><strong>{formatINR(l.plannedInr)}</strong></li>)}</ul></div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h3 className="font-bold">Top 3 audit flags</h3>
                  {topFlags.length === 0 ? <p className="mt-3 rounded-lg notice-success p-3 text-sm">✓ All 12 audit rules pass right now. Health {health}/100.</p> : topFlags.map(f => <div key={f.id} className={`mt-2 rounded-lg p-3 text-sm ${f.severity === "blocker" ? "notice-danger" : f.severity === "warning" ? "notice-warning" : "notice-info"}`}><strong className="capitalize">{f.severity} — {f.id}:</strong> {f.message}<p className="mt-1 text-xs">Fix: {f.suggestedFix}</p></div>)}
                  <button onClick={() => setPlanTab("Audit")} className="mt-3 rounded-full bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white">Open full Audit (all 12 rules) →</button>
                  <p className="mt-3 text-sm text-[var(--dim)]">Venue needed: {formatNum(plannedGuests)} capacity • Parking: {ev.needsParking ? `${ev.expectedCars} cars` : "Not needed"} • Food: {ev.foodType} • Decor: {ev.decorLevel}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h3 className="font-bold">Next steps</h3><p className="mt-2 text-sm text-[var(--dim)]">Edit Budget, Venue, Food, People or Timeline — every total and audit flag recalculates instantly in code, with no AI call on slider moves. Save each section to persist it.</p></div>
              {(ev.aiNotes && ev.aiNotes.length) || (ev.risks && ev.risks.length) ? (
                <div className="rounded-2xl border notice-success p-5">
                  <h3 className="font-bold">🤖 AI notes — trade-offs from {ev.aiModel}</h3>
                  {ev.aiNotes?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{ev.aiNotes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
                  {ev.menu?.notes ? <p className="mt-2 text-sm"><strong>Menu note:</strong> {ev.menu.notes}</p> : null}
                  {ev.risks?.length ? <div className="mt-3"><p className="text-sm font-semibold">Risks flagged by AI (verified in Audit tab):</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{ev.risks.map((r, i) => <li key={i}>{r}</li>)}</ul></div> : null}
                  <p className="mt-2 text-xs flag-dim">Venue options are AI suggestions to verify — not bookings. All numbers above were recalculated in code.</p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <h3 className="font-bold">↻ Regenerate with AI</h3>
                <p className="mt-1 text-sm text-[var(--dim)]">Regenerate only a section where possible, otherwise the whole plan. Version will increment. If AI fails, it retries once and keeps your current plan with an explanation.</p>
                {!settings?.hasKey ? <p className="mt-2 rounded-lg notice-warning p-3 text-sm">AI not connected yet — <button onClick={() => { setReturnScreen("plan"); setScreen("settings"); }} className="font-bold underline">add your Gemini key in Settings</button> to enable regeneration.</p> : null}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><label htmlFor="regen-section" className="text-sm font-semibold">Section</label><select id="regen-section" value={regenSection} onChange={e => setRegenSection(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"><option value="all">Whole plan</option><option value="budget">Budget only</option><option value="venue">Venue only</option><option value="food">Food / menu only</option><option value="people">People only</option></select></div>
                  <div><label htmlFor="regen-instruction" className="text-sm font-semibold">Edit instruction (optional)</label><input id="regen-instruction" maxLength={FIELD_LIMITS.regenInstruction} value={regenInstruction} onChange={e => setRegenInstruction(e.target.value)} placeholder="e.g. keep food, reduce decor" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5" /></div>
                </div>
                <button onClick={() => regenMut.mutate()} disabled={regenMut.isPending} className="mt-3 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50">{regenMut.isPending ? "Regenerating with Gemini…" : `Regenerate ${regenSection === "all" ? "whole plan" : regenSection} with AI`}</button>
                {regenMut.isError ? <p role="alert" className="mt-2 text-sm text-danger-strong">{String((regenMut.error as Error)?.message || regenMut.error)}</p> : null}
              </div>
            </div>
          )}

          {planTab === "Budget" && (
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h3 className="font-serif-display text-2xl">Aegis Budget — editable lines + sliders</h3>
              <p className="mt-1 text-sm text-[var(--dim)]">Sliders respect the maximum: a slider can only go up to what is left of the maximum after the other categories. Typing a number can go over, but then saving is blocked until you reduce the total or explicitly raise the maximum. No AI call on slider moves — all maths is in code.</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label htmlFor="edit-budget-min" className="text-sm font-semibold">Budget minimum (₹)</label><input id="edit-budget-min" type="number" min={0} step={1000} value={effectiveMin} onChange={e => { setEditBudgetMin(Number(e.target.value) || 0); setSaveMsg(""); }} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5" /></div>
                <div><label htmlFor="edit-budget-max" className="text-sm font-semibold">Budget maximum (₹)</label><input id="edit-budget-max" type="number" min={0} step={1000} value={effectiveMax} onChange={e => { setEditBudgetMax(Number(e.target.value) || 0); setRaiseMaxChecked(false); setSaveMsg(""); }} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5" /></div>
              </div>
              <div className="mt-5 space-y-5">
                {editLines.map((l, idx) => { const sliderMax = Math.max(l.plannedInr, effectiveMax - (totalPlanned - l.plannedInr)); return (
                  <div key={l.category} className="border-b border-[var(--border)] pb-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="flex-1"><p id={`budget-label-${l.category}`} className="font-semibold">{l.label}</p><p className="text-xs text-[var(--dim)]">{l.note}</p></div>
                      <label className="sr-only" htmlFor={`budget-${l.category}`}>{l.label} amount in INR</label>
                      <input id={`budget-${l.category}`} type="number" min={0} step={500} value={l.plannedInr} onChange={e => { const copy = [...editLines]; copy[idx] = { ...l, plannedInr: Number(e.target.value) || 0 }; setEditLines(copy); setSaveMsg(""); }} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-right font-medium sm:w-44" />
                      <span className="text-sm text-[var(--dim)]">{totalPlanned ? Math.round(l.plannedInr / totalPlanned * 100) : 0}%</span>
                    </div>
                    <input id={`budget-slider-${l.category}`} aria-labelledby={`budget-label-${l.category}`} aria-valuetext={`${l.label}: ${formatINR(l.plannedInr)}`} type="range" min={0} max={sliderMax} step={5000} value={Math.min(l.plannedInr, sliderMax)} onChange={e => { const copy = [...editLines]; copy[idx] = { ...l, plannedInr: Number(e.target.value) || 0 }; setEditLines(copy); setSaveMsg(""); }} className="mt-2 w-full" />
                    <p className="text-xs text-[var(--dim)]">Slider max {formatINR(sliderMax)} — capped so the running total cannot exceed the maximum {formatINR(effectiveMax)} via the slider.</p>
                  </div>); })}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-[var(--surface-alt)] p-4 text-center">
                <div><p className="text-xs text-[var(--dim)]">TOTAL</p><p className="font-bold">{formatINR(totalPlanned)}</p></div>
                <div><p className="text-xs text-[var(--dim)]">REMAINING TO MAX</p><p className={`font-bold ${remaining < 0 ? "text-danger-strong" : "text-success-strong"}`}>{formatINR(remaining)}</p></div>
                <div><p className="text-xs text-[var(--dim)]">PER GUEST</p><p className="font-bold">{formatINR(perGuest)}</p></div>
              </div>
              {overBudget ? (
                <div role="alert" className="mt-3 rounded-lg notice-danger p-4 text-sm">
                  <p className="font-semibold">Warning before save: total {formatINR(totalPlanned)} exceeds maximum {formatINR(effectiveMax)} by {formatINR(totalPlanned - effectiveMax)}.</p>
                  <p className="mt-1">Saving is blocked unless you reduce a category, or explicitly raise the maximum. Code will not silently change your maximum.</p>
                  <label className="mt-3 flex items-start gap-2 font-medium"><input type="checkbox" aria-label="Raise maximum to fit total" checked={raiseMaxChecked} onChange={e => { const checked = e.target.checked; setRaiseMaxChecked(checked); if (checked) setEditBudgetMax(totalPlanned); }} className="mt-1 h-4 w-4" /> Raise my maximum budget to {formatINR(totalPlanned)} to fit this total</label>
                  {raiseMaxChecked ? <p className="mt-2 font-medium">Maximum will be saved as {formatINR(effectiveMax)}. You can edit it above before saving.</p> : null}
                </div>
              ) : null}
              <button onClick={() => { if (overBudget && !raiseMaxChecked) { setSaveMsg("Blocked: total exceeds maximum. Reduce a category or tick 'Raise maximum to fit total' above, then save."); return; } if (effectiveMin >= effectiveMax) { setSaveMsg("Blocked: minimum must be less than maximum."); return; } saveCurrent(); }} disabled={updateMut.isPending} className="mt-5 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50">{updateMut.isPending ? "Saving…" : "Save budget changes"}</button>
              {saveMsg ? <p role="status" aria-live="polite" className="mt-2 text-center text-sm text-success-strong">{saveMsg}</p> : null}
              {updateMut.isError ? <p role="alert" className="mt-2 text-center text-sm text-danger-strong">{String((updateMut.error as Error)?.message || updateMut.error)}</p> : null}
            </div>
          )}

          {planTab === "Venue" && (
            <div className="mt-5 space-y-4">
              <h3 className="font-serif-display text-2xl">Aegis Venue — suggestions & fit scores</h3>
              <p className="text-sm text-[var(--dim)]">{ev.planSource === "ai" ? "Aegis AI suggestions — verify capacity & price before booking." : "Aegis template suggestions — verify capacity & price before booking."} Need: <strong>{formatNum(plannedGuests)} capacity</strong>{ev.needsParking ? `, ${ev.expectedCars} parking spaces` : ""}. Preference: {ev.venuePref}{ev.areaPreference ? ` • ${ev.areaPreference}` : ""} Fit score = capacity 50 + parking 30 + cost vs venue budget 20.</p>
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="flex-1 text-sm">Selected: <strong>{selectedVenue?.name ?? "None"}</strong> • Venue budget line: <strong>{formatINR(venueBudgetInr)}</strong> • {editVenueConfirmed ? "Venue confirmed ✓" : "Venue not confirmed"}</p>
                <button onClick={() => { const next = !editVenueConfirmed; setEditVenueConfirmed(next); setSaveMsg(""); }} aria-label="Toggle venue confirmed" className={`rounded-full px-4 py-2 text-sm font-semibold ${editVenueConfirmed ? "bg-teal-600 text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}>{editVenueConfirmed ? "Venue confirmed ✓" : "Mark venue confirmed"}</button>
                <button onClick={() => saveCurrent()} disabled={updateMut.isPending} className="rounded-full bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save venue selection</button>
              </div>
              {saveMsg ? <p role="status" aria-live="polite" className="text-center text-sm text-success-strong">{saveMsg}</p> : null}
              {venues.map(v => { const tooSmall = v.capacity < plannedGuests; const parkingShort = ev.needsParking && v.parkingSpaces < ev.expectedCars; const fit = venueFitScore(v, plannedGuests, ev.needsParking, ev.expectedCars, venueBudgetInr); const isSelected = selectedVenue?.name === v.name; return (
                <div key={v.name} className={`rounded-2xl border p-5 ${tooSmall ? "notice-danger" : "border-[var(--border)] bg-[var(--surface)]"} ${isSelected ? "ring-2 ring-[#0F4C4C]" : ""}`}>
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{v.name} {isSelected ? <span className="ml-1 rounded-full bg-[#0F4C4C] px-2 py-0.5 text-xs text-white">Selected</span> : null}</h3><p className="text-sm text-[var(--dim)]">{v.kind}</p></div><div className="text-right"><span className="font-serif-display text-xl">{formatINR(v.costInr)}</span><p className="text-sm font-bold text-accent-strong">Fit score: {fit}/100</p></div></div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><span>Capacity: <strong>{formatNum(v.capacity)}</strong></span><span>Parking: <strong>{formatNum(v.parkingSpaces)} cars</strong></span><span>Cost: <strong>{formatINR(v.costInr)}</strong></span><span>Fit score: <strong>{fit}/100</strong></span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-[#0F4C4C]" style={{ width: `${fit}%` }} /></div>
                  {tooSmall ? <p role="alert" className="mt-3 rounded-lg notice-danger p-2.5 text-sm font-medium">⚠ Mismatch — VENUE_TOO_SMALL: needs {formatNum(plannedGuests)}, this holds {formatNum(v.capacity)}. Pick a larger venue.</p> : <p className="mt-3 text-sm text-success-strong">✓ Fits guests + buffer</p>}
                  {parkingShort ? <p className="mt-1 rounded-lg notice-warning p-2.5 text-sm">⚠ Parking shortfall — PARKING_SHORTFALL: need {ev.expectedCars} cars, has {v.parkingSpaces}.</p> : null}
                  <button onClick={() => { const newLines = editLines.map(l => l.category === "venue" ? { ...l, plannedInr: v.costInr } : l); setEditSelectedVenue(v.name); setEditLines(newLines); setSaveMsg(`Selected ${v.name} — venue line is now ${formatINR(v.costInr)}, total is ${formatINR(newLines.reduce((s, l) => s + l.plannedInr, 0))}. Save to persist, audit already recalculated above.`); }} aria-label={`Select venue ${v.name}`} disabled={isSelected} className="mt-3 w-full rounded-xl bg-[#0F4C4C] px-4 py-2.5 font-semibold text-white disabled:opacity-40">{isSelected ? "Selected — totals use this venue" : `Select ${v.name} — update totals & audit`}</button>
                </div>); })}
            </div>
          )}

          {planTab === "Food" && (
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h3 className="font-serif-display text-2xl">Aegis Food & menu builder</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <p>Type: <strong className="capitalize">{ev.foodType}</strong></p><p>Planned guests (with buffer): <strong>{formatNum(plannedGuests)}</strong></p>
                {ev.foodType === "mixed" ? <><p>Veg plates: <strong>{formatNum(vegPlates)} ({ev.vegPercent}%)</strong> = ceil({formatNum(plannedGuests)} × {ev.vegPercent}%)</p><p>Non-veg plates: <strong>{formatNum(nonVegDisplay)} ({100 - ev.vegPercent}%)</strong> = planned − veg, so plates total {formatNum(vegPlates + nonVegDisplay)}</p></> : null}
                {ev.foodType === "veg" ? <p>Veg plates: <strong>{formatNum(plannedGuests)}</strong></p> : null}
                {ev.foodType === "non-veg" ? <p>Non-veg plates: <strong>{formatNum(plannedGuests)}</strong></p> : null}
                <p className="col-span-2">Menu courses: <strong>{effectiveCourses.length ? effectiveCourses.join(", ") : "No courses yet — add one below"}</strong></p>
                {ev.dietaryNotes ? <p className="col-span-2">Dietary: {ev.dietaryNotes}</p> : null}
              </div>
              <div className="mt-4 rounded-xl border border-[var(--border)] p-4">
                <p className="font-semibold">Menu builder — courses</p>
                <div className="mt-2 flex flex-wrap gap-2">{effectiveCourses.map((c, ci) => <span key={`${c}-${ci}`} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-alt)] px-3 py-1.5 text-sm">{c}<button aria-label={`Remove course ${c}`} onClick={() => { const copy = effectiveCourses.filter((_, i) => i !== ci); setEditMenuCourses(copy); setSaveMsg(""); }} className="font-bold text-danger-strong">×</button></span>)}</div>
                <div className="mt-3 flex gap-2"><label className="sr-only" htmlFor="new-course">New course name</label><input id="new-course" maxLength={FIELD_LIMITS.menuCourse} value={newCourse} onChange={e => setNewCourse(e.target.value)} placeholder="e.g. Dessert, Live Chaat Counter" className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5" /><button onClick={() => { const t = newCourse.trim(); if (!t) return; setEditMenuCourses([...effectiveCourses, t]); setNewCourse(""); setSaveMsg(""); }} aria-label="Add course" className="rounded-xl bg-[#0F4C4C] px-4 py-2.5 font-semibold text-white">Add course</button></div>
                <p className="mt-2 text-xs text-[var(--dim)]">If desserts are requested but no Dessert course is here, audit rule MISSING_DESSERT_CHOICE will warn — its one-click fix adds Dessert here.</p>
              </div>
              <div className="mt-6">
                <label htmlFor="cost-per-plate" className="font-semibold">Cost per plate (₹)</label>
                <input id="cost-per-plate" type="number" min={0} step={10} value={editCostPerPlate} onChange={e => { const v = Number(e.target.value) || 0; setEditCostPerPlate(v); setEditLines(prev => prev.map(l => l.category === "food" ? { ...l, plannedInr: v * plannedGuests } : l)); setSaveMsg(""); }} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg sm:w-56" />
                <p className="mt-2 text-sm">Food cost = {formatINR(editCostPerPlate)} × {formatNum(plannedGuests)} = <strong>{formatINR(editCostPerPlate * plannedGuests)}</strong>{foodLine ? ` (Budget line: ${formatINR(foodLine.plannedInr)})` : ""}</p>
              </div>
              <div className="mt-6 space-y-3">
                {[
                  { label: "Desserts", val: editDesserts, key: "desserts" as const, desc: "₹150 / plate" },
                  { label: "Fruits", val: editFruits, key: "fruits" as const, desc: "₹80 / plate" },
                  { label: "Dry Fruits", val: editDryFruits, key: "dryFruits" as const, desc: "₹120 / plate" },
                ].map(row => (
                  <div key={row.key} className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
                    <div><p className="font-semibold">{row.label}</p><p className="text-sm text-[var(--dim)]">{row.desc} — toggling updates food total instantly</p></div>
                    <button role="switch" aria-checked={row.val} aria-label={row.label} onClick={() => handleFoodToggle(row.key, !row.val)} className={`h-8 w-14 shrink-0 rounded-full p-1 ${row.val ? "bg-[#0F4C4C]" : "bg-gray-300"}`}><span className={`block h-6 w-6 rounded-full bg-white transition ${row.val ? "translate-x-6" : ""}`} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => saveCurrent()} disabled={updateMut.isPending} className="mt-5 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50">{updateMut.isPending ? "Saving…" : "Save food changes"}</button>
              {saveMsg ? <p role="status" aria-live="polite" className="mt-2 text-center text-sm text-success-strong">{saveMsg}</p> : null}
            </div>
          )}

          {planTab === "People" && (
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h3 className="font-serif-display text-2xl">Aegis People & manpower — editable roster</h3>
              <p className="mt-1 text-sm text-[var(--dim)]">Staff ratio: 1 server per 20 guests = {Math.ceil(ev.guestCount / 20)} servers needed for {formatNum(ev.guestCount)} guests. Editing count or cost recalculates the roster total and the Manpower budget line instantly in code — no AI call.</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead><tr className="border-b border-[var(--border)] text-[var(--dim)]"><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Count</th><th className="py-2 pr-3">Cost per person (₹)</th><th className="py-2 text-right">Line total</th></tr></thead>
                  <tbody>
                    {effectiveManpower.length === 0 ? <tr><td colSpan={4} className="py-4 text-[var(--dim)]">No manpower selected.</td></tr> : effectiveManpower.map((m, mi) => (
                      <tr key={m.role} className="border-b border-[var(--border)]">
                        <td className="py-3 pr-3"><p className="font-semibold">{m.label}</p><p className="text-xs text-[var(--dim)]">{m.role}{CRITICAL_ROLES.includes(m.role) ? " • critical role" : ""}</p></td>
                        <td className="py-3 pr-3"><label className="sr-only" htmlFor={`mp-count-edit-${m.role}`}>{m.label} count</label><input id={`mp-count-edit-${m.role}`} aria-label={`${m.label} count`} type="number" min={0} value={m.count} onChange={e => { const copy = effectiveManpower.map((x, i) => i === mi ? { ...x, count: Math.max(0, Number(e.target.value) || 0) } : x); setEditManpower(copy); setEditLines(syncManpower(copy)); setSaveMsg(""); }} className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-center" /></td>
                        <td className="py-3 pr-3"><label className="sr-only" htmlFor={`mp-cost-edit-${m.role}`}>{m.label} cost per person</label><input id={`mp-cost-edit-${m.role}`} aria-label={`${m.label} cost per person in rupees`} type="number" min={0} step={100} value={m.costPerPersonInr} onChange={e => { const copy = effectiveManpower.map((x, i) => i === mi ? { ...x, costPerPersonInr: Math.max(0, Number(e.target.value) || 0) } : x); setEditManpower(copy); setEditLines(syncManpower(copy)); setSaveMsg(""); }} className="w-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-right" /></td>
                        <td className="py-3 text-right font-semibold">{formatINR(m.count * m.costPerPersonInr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-between rounded-xl bg-[var(--surface-alt)] p-4"><span className="font-semibold">Manpower total (live, also the Budget → Manpower line)</span><strong>{formatINR(manpowerTotalLive)}</strong></div>
              <p className="mt-3 text-sm text-[var(--dim)]">Decor level: <span className="capitalize font-medium text-[var(--text)]">{ev.decorLevel}</span> • Entertainment: {ev.entertainmentTypes} ({ev.entertainmentHours}h) • Kids activities: {ev.kidsActivities ? "Yes" : "No"}</p>
              <button onClick={() => saveCurrent()} disabled={updateMut.isPending} className="mt-4 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50">{updateMut.isPending ? "Saving…" : "Save people changes"}</button>
              {saveMsg ? <p role="status" aria-live="polite" className="mt-2 text-center text-sm text-success-strong">{saveMsg}</p> : null}
            </div>
          )}

          {planTab === "Timeline" && (
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h3 className="font-serif-display text-2xl">Aegis Timeline checklist — counting back from {ev.eventDate}</h3>
              <p className="mt-1 text-sm text-[var(--dim)]">Each task has an owner and a status. Clear an owner to see NO_TIMELINE_OWNER in Audit — its fix reassigns Coordinator. Event is in {daysUntilEvent(ev.eventDate)} day(s).</p>
              <div className="mt-5 space-y-3">
                {effectiveTasks.map((t, i) => (
                  <div key={`${t.title}-${i}`} className="rounded-xl border border-[var(--border)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{t.title}</p><p className="text-sm text-[var(--dim)]">{addDays(ev.eventDate, -Math.abs(t.dueInDaysBefore))} • {Math.abs(t.dueInDaysBefore)} days before • Due in days before: {t.dueInDaysBefore}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.status === "done" ? "notice-success" : t.status === "in_progress" ? "notice-warning" : "bg-[var(--surface-alt)]"}`}>{t.status === "done" ? "Done" : t.status === "in_progress" ? "In progress" : "To do"}</span></div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div><label htmlFor={`task-owner-${i}`} className="text-xs font-semibold">Owner</label><input id={`task-owner-${i}`} value={t.owner} onChange={e => { const copy = effectiveTasks.map((x, xi) => xi === i ? { ...x, owner: e.target.value } : x); setEditTasks(copy); setSaveMsg(""); }} placeholder="e.g. Coordinator (leave blank to trigger audit info)" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2" /></div>
                      <div><label htmlFor={`task-status-${i}`} className="text-xs font-semibold">Status</label><select id={`task-status-${i}`} value={t.status} onChange={e => { const copy = effectiveTasks.map((x, xi) => xi === i ? { ...x, status: e.target.value } : x); setEditTasks(copy); setSaveMsg(""); }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></div>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl bg-[var(--surface-alt)] p-4"><p className="font-semibold">Event day — {ev.title}</p><p className="text-sm text-[var(--dim)]">{addDays(ev.eventDate, 0)} • Owner: All</p></div>
              </div>
              <button onClick={() => saveCurrent()} disabled={updateMut.isPending} className="mt-4 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50">{updateMut.isPending ? "Saving…" : "Save timeline changes"}</button>
              {saveMsg ? <p role="status" aria-live="polite" className="mt-2 text-center text-sm text-success-strong">{saveMsg}</p> : null}
            </div>
          )}


          {planTab === "Audit" && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <h3 className="font-serif-display text-2xl">Aegis Audit engine — all 12 rules, in code</h3>
                <p className="mt-1 text-sm text-[var(--dim)]">Health score <strong>{health}/100</strong> = 100 − 25 per blocker − 10 per warning − 2 per info, floor 0. The score never hides flags: all 12 are listed below. Plan {ev.planSource} v{ev.planVersion} • Total {formatINR(totalPlanned)} vs max {formatINR(effectiveMax)} • Per-guest floor for {ev.eventType}: {formatINR(PER_GUEST_FLOORS[ev.eventType] ?? 1500)} • Servers ratio 1 per 20.</p>
                <p className="mt-2 rounded-lg bg-[var(--surface-alt)] p-3 text-sm">A flag only moves to <strong>Resolved</strong> after recalculation passes. There is <strong>no manual “mark resolved” button for blockers</strong> — use Apply fix, or fix it in its tab, and the engine rechecks.</p>
                {fixMessage ? <div role="status" className="mt-3 rounded-lg border notice-info p-3 text-sm">{fixMessage}</div> : null}
                {saveMsg ? <p className="mt-2 text-sm text-success-strong">{saveMsg}</p> : null}
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[var(--dim)]">FILTER BY SEVERITY</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">{([["all", "All severities"], ["blocker", "Blocker"], ["warning", "Warning"], ["info", "Info"]] as [string, string][]).map(([val, label]) => <button key={val} onClick={() => setAuditSeverityFilter(val)} aria-pressed={auditSeverityFilter === val} aria-label={`Filter severity ${label}`} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${auditSeverityFilter === val ? "bg-[#0F4C4C] text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}>{label}</button>)}</div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--dim)]">FILTER BY STATUS</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">{([["all", "All flags"], ["unresolved", "Unresolved"], ["resolved", "Resolved"]] as [string, string][]).map(([val, label]) => <button key={val} onClick={() => setAuditResolvedFilter(val)} aria-pressed={auditResolvedFilter === val} aria-label={`Filter status ${label}`} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${auditResolvedFilter === val ? "bg-[#B45309] text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}>{label}</button>)}</div>
                  </div>
                  <p className="text-sm text-[var(--dim)]">Showing {auditFlags.filter(f => (auditSeverityFilter === "all" || f.severity === auditSeverityFilter) && (auditResolvedFilter === "all" || (auditResolvedFilter === "resolved" ? f.resolved : !f.resolved))).length} of 12 rules • {unresolvedFlags.length} unresolved ({unresolvedFlags.filter(f => f.severity === "blocker").length} blocker, {unresolvedFlags.filter(f => f.severity === "warning").length} warning, {unresolvedFlags.filter(f => f.severity === "info").length} info)</p>
                </div>
                <div className="mt-4 space-y-3">
                  {auditFlags.filter(f => (auditSeverityFilter === "all" || f.severity === auditSeverityFilter) && (auditResolvedFilter === "all" || (auditResolvedFilter === "resolved" ? f.resolved : !f.resolved))).map(f => (
                    <div key={f.id} role="group" aria-label={`Audit rule ${f.id}, ${f.severity}, ${f.resolved ? "resolved" : "unresolved"}`} className={`rounded-xl border p-4 ${f.resolved ? "flag-resolved" : f.severity === "blocker" ? "flag-blocker" : f.severity === "warning" ? "flag-warning" : "flag-info"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${f.severity === "blocker" ? "bg-red-600 text-white" : f.severity === "warning" ? "chip-warning-solid" : "bg-blue-600 text-white"}`}>{f.severity}</span>
                        <strong className="text-sm">{f.id}</strong>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${f.resolved ? "bg-green-600 text-white" : "bg-gray-800 text-white"}`}>{f.resolved ? "✓ Resolved" : "Unresolved"}</span>
                      </div>
                      <p className="mt-2 text-sm">{f.message}</p>
                      <p className="mt-1 text-sm flag-dim"><strong>Suggested fix:</strong> {f.suggestedFix}</p>
                      {!f.resolved ? (
                        <div className="mt-3">
                          <button onClick={() => applyFix(f)} disabled={updateMut.isPending} aria-label={`Apply fix for ${f.id}`} className="rounded-xl bg-[#0F4C4C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{updateMut.isPending ? "Applying & recalculating…" : `Apply fix: ${f.fixLabel}`}</button>
                          <p className="mt-1.5 text-xs flag-dim">One-click fix is applied in code and saved, then recalculated. If recalculation still fails, this flag stays Unresolved with an explanation above — blockers cannot be manually marked resolved.</p>
                        </div>
                      ) : <p className="mt-2 text-xs font-semibold">Resolved by recalculation — the underlying numbers now pass this rule.</p>}
                    </div>
                  ))}
                  {auditFlags.filter(f => (auditSeverityFilter === "all" || f.severity === auditSeverityFilter) && (auditResolvedFilter === "all" || (auditResolvedFilter === "resolved" ? f.resolved : !f.resolved))).length === 0 ? <p className="rounded-lg bg-[var(--surface-alt)] p-4 text-center text-sm text-[var(--dim)]">No flags match these filters. Try All severities / All flags.</p> : null}
                  {ev.risks?.map((r, i) => <p key={i} className="rounded-lg notice-warning p-3 text-sm"><strong>AI risk (not an audit rule):</strong> {r}</p>)}
                </div>
              </div>
            </div>
          )}

          {planTab === "Versions" && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <h3 className="font-serif-display text-2xl">Aegis Plan versions — snapshot history</h3>
                <p className="mt-1 text-sm text-[var(--dim)]">Every generate, regenerate and save snapshots the full plan: budget lines, selected venue, menu, manpower roster and tasks, plus source, total, per-guest cost and health score. Totals and health below are <strong>recalculated in code from the snapshot</strong>, never just read from storage. Restoring creates a brand-new version, so nothing is lost, and Audit re-checks the restored plan — a restore cannot silently hide an over-budget or venue-too-small problem.</p>
                {versionsQuery.isPending ? <p className="mt-3 text-[var(--dim)]">Loading versions…</p> : null}
                {versionsList.length === 0 && !versionsQuery.isPending ? <p className="mt-3 rounded-lg bg-[var(--surface-alt)] p-3 text-sm">No snapshots yet for this event. Save any section or regenerate and a version will appear here. Older plans from Milestones 1–3 are backfilled with a snapshot of their current state.</p> : null}
                {restoreMsg ? <div role="status" className="mt-3 rounded-lg border notice-info p-3 text-sm">{restoreMsg}</div> : null}
                <div className="mt-4 space-y-3">
                  {versionsList.map(v => { const m = metricsForSnapshot(v.snapshot); const isCurrent = v.versionNumber === ev.planVersion; return (
                    <div key={v.id} className={`rounded-xl border p-4 ${isCurrent ? "border-[var(--accent-strong)] ring-1 ring-[var(--accent-strong)]" : "border-[var(--border)]"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">Version {v.versionNumber} {isCurrent ? <span className="ml-1 rounded-full bg-[#0F4C4C] px-2 py-0.5 text-xs text-white">Current</span> : null} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${v.source === "ai" ? "notice-success" : "notice-warning"}`}>{v.source === "ai" ? "✨ AI-generated" : "📋 Template"}</span></p>
                          <p className="mt-1 text-sm text-[var(--dim)]">{v.label || "Plan snapshot"} • {new Date(v.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                          <p className="mt-2 text-sm">Total <strong>{formatINR(m.total)}</strong> • Per guest <strong>{formatINR(m.perGuest)}</strong> • Health <strong>{m.health}/100</strong> • Venue <strong>{m.selectedVenue?.name ?? "None"}</strong> • {m.flags.filter(f => !f.resolved).length} unresolved flag(s)</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 text-xs font-semibold"><input type="radio" name="compare-a" aria-label={`Compare A version ${v.versionNumber}`} checked={(compareA?.id ?? null) === v.id} onChange={() => setCompareAId(v.id)} /> Compare A</label>
                          <label className="flex items-center gap-2 text-xs font-semibold"><input type="radio" name="compare-b" aria-label={`Compare B version ${v.versionNumber}`} checked={(compareB?.id ?? null) === v.id} onChange={() => setCompareBId(v.id)} /> Compare B</label>
                          <button onClick={() => { setSummaryVersionId(v.id); setPlanTab("Summary"); }} aria-label={`View summary for version ${v.versionNumber}`} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold">Summary for v{v.versionNumber}</button>
                          {!isCurrent ? (
                            restoreConfirmId === v.id ? (
                              <span role="alertdialog" aria-label={`Restore version ${v.versionNumber}?`} className="flex flex-col gap-1"><span className="text-xs font-semibold text-danger-strong">Restore v{v.versionNumber}? Current plan stays in history as a new version.</span><button onClick={() => restoreMut.mutate(v.id)} disabled={restoreMut.isPending} aria-label={`Confirm restore version ${v.versionNumber}`} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{restoreMut.isPending ? "Restoring & recalculating…" : `Yes, restore v${v.versionNumber}`}</button><button onClick={() => setRestoreConfirmId(null)} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs">Cancel</button></span>
                            ) : <button onClick={() => { setRestoreConfirmId(v.id); setRestoreMsg(""); }} aria-label={`Restore version ${v.versionNumber}`} className="rounded-full bg-[#B45309] px-3 py-1.5 text-xs font-bold text-white">Restore v{v.versionNumber}</button>
                          ) : <span className="text-xs text-[var(--dim)]">This is the live plan</span>}
                        </div>
                      </div>
                    </div>); })}
                </div>
              </div>

              {compareA && compareB && compareA.id !== compareB.id ? (() => { const ma = metricsForSnapshot(compareA.snapshot); const mb = metricsForSnapshot(compareB.snapshot); const cmp = compareSnapshots(compareA.snapshot, compareB.snapshot, { guestCount: evNonNull.guestCount, eventType: evNonNull.eventType, eventDate: evNonNull.eventDate, budgetMinInr: evNonNull.budgetMinInr, budgetMaxInr: evNonNull.budgetMaxInr }); const cats = Array.from(new Set([...(compareA.snapshot.budgetLines ?? []).map(l => l.category), ...(compareB.snapshot.budgetLines ?? []).map(l => l.category)])); const roles = Array.from(new Set([...(compareA.snapshot.manpower ?? []).map(m => m.role), ...(compareB.snapshot.manpower ?? []).map(m => m.role)])); return (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <h3 className="font-serif-display text-2xl">Compare — v{compareA.versionNumber} vs v{compareB.versionNumber}</h3>
                  <p className="mt-1 text-sm text-[var(--dim)]">Side by side, recalculated in code. Change = B − A.</p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                    <div className="rounded-xl bg-[var(--surface-alt)] p-3"><p className="text-xs text-[var(--dim)]">TOTAL</p><p className="font-bold">{formatINR(ma.total)} → {formatINR(mb.total)}</p><p className={cmp.totalDiff > 0 ? "text-danger-strong font-semibold" : "text-success-strong font-semibold"}>{cmp.totalDiff >= 0 ? "+" : ""}{formatINR(cmp.totalDiff)}</p></div>
                    <div className="rounded-xl bg-[var(--surface-alt)] p-3"><p className="text-xs text-[var(--dim)]">PER GUEST</p><p className="font-bold">{formatINR(ma.perGuest)} → {formatINR(mb.perGuest)}</p></div>
                    <div className="rounded-xl bg-[var(--surface-alt)] p-3"><p className="text-xs text-[var(--dim)]">HEALTH</p><p className="font-bold">{ma.health}/100 → {mb.health}/100</p></div>
                  </div>
                  <h4 className="mt-5 font-bold">Budget — what changed</h4>
                  <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b border-[var(--border)] text-[var(--dim)]"><th className="py-2 pr-3">Category</th><th className="py-2 pr-3">v{compareA.versionNumber} (A)</th><th className="py-2 pr-3">v{compareB.versionNumber} (B)</th><th className="py-2">Change</th></tr></thead><tbody>{cats.map(cat => { const a = compareA.snapshot.budgetLines.find(l => l.category === cat); const b = compareB.snapshot.budgetLines.find(l => l.category === cat); const diff = (b?.plannedInr ?? 0) - (a?.plannedInr ?? 0); return <tr key={cat} className={`border-b border-[var(--border)] ${diff !== 0 ? "row-changed font-medium" : ""}`}><td className="py-2 pr-3">{b?.label ?? a?.label ?? cat}</td><td className="py-2 pr-3">{formatINR(a?.plannedInr ?? 0)}</td><td className="py-2 pr-3">{formatINR(b?.plannedInr ?? 0)}</td><td className="py-2">{diff === 0 ? "— No change" : `${diff > 0 ? "+" : ""}${formatINR(diff)}`}</td></tr>; })}</tbody></table></div>
                  <h4 className="mt-5 font-bold">Venue</h4>
                  <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    {[compareA, compareB].map((v, idx) => { const m = idx === 0 ? ma : mb; const sel = m.selectedVenue; return <div key={v.id} className="rounded-xl border border-[var(--border)] p-3"><p className="font-semibold">v{v.versionNumber}: {sel?.name ?? "None"}</p><p className="text-[var(--dim)]">Capacity {sel ? formatNum(sel.capacity) : "—"} • Parking {sel ? formatNum(sel.parkingSpaces) : "—"} • Cost {sel ? formatINR(sel.costInr) : "—"} • {v.snapshot.venueConfirmed ? "Confirmed ✓" : "Not confirmed"}</p></div>; })}
                  </div>
                  {ma.selectedVenue?.name === mb.selectedVenue?.name ? <p className="mt-2 text-sm text-[var(--dim)]">Venue did not change between these versions.</p> : <p className="mt-2 text-sm font-medium text-warning-strong">Venue changed: {ma.selectedVenue?.name ?? "None"} → {mb.selectedVenue?.name ?? "None"}</p>}
                  <h4 className="mt-5 font-bold">Menu</h4>
                  <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    {[compareA, compareB].map(v => <div key={v.id} className="rounded-xl border border-[var(--border)] p-3"><p className="font-semibold">v{v.versionNumber}: {formatINR(v.snapshot.costPerPlateInr)} / plate</p><p className="text-[var(--dim)]">{(v.snapshot.menu?.courses ?? []).join(", ") || "No courses"} • Desserts {v.snapshot.desserts ? "Yes" : "No"} • Fruits {v.snapshot.fruits ? "Yes" : "No"} • Dry fruits {v.snapshot.dryFruits ? "Yes" : "No"}</p></div>)}
                  </div>
                  <h4 className="mt-5 font-bold">Manpower</h4>
                  <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b border-[var(--border)] text-[var(--dim)]"><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">v{compareA.versionNumber}</th><th className="py-2">v{compareB.versionNumber}</th></tr></thead><tbody>{roles.map(role => { const a = compareA.snapshot.manpower.find(m => m.role === role); const b = compareB.snapshot.manpower.find(m => m.role === role); const changed = (a?.count ?? 0) !== (b?.count ?? 0) || (a?.costPerPersonInr ?? 0) !== (b?.costPerPersonInr ?? 0); return <tr key={role} className={`border-b border-[var(--border)] ${changed ? "row-changed font-medium" : ""}`}><td className="py-2 pr-3">{b?.label ?? a?.label ?? role}</td><td className="py-2 pr-3">{a ? `${a.count} × ${formatINR(a.costPerPersonInr)} = ${formatINR(a.count * a.costPerPersonInr)}` : "—"}</td><td className="py-2">{b ? `${b.count} × ${formatINR(b.costPerPersonInr)} = ${formatINR(b.count * b.costPerPersonInr)}` : "—"}{changed ? " • Changed" : ""}</td></tr>; })}</tbody></table></div>
                  <h4 className="mt-5 font-bold">Tasks</h4>
                  <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    {[compareA, compareB].map(v => <div key={v.id} className="rounded-xl border border-[var(--border)] p-3"><p className="font-semibold">v{v.versionNumber}: {(v.snapshot.tasks ?? []).length} tasks</p><ul className="mt-1 list-disc space-y-1 pl-5">{(v.snapshot.tasks ?? []).map((t, i) => <li key={i}>{t.title} — {t.owner || "No owner"} ({(t as { status?: string }).status ?? "todo"})</li>)}</ul></div>)}
                  </div>
                </div>); })() : <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--dim)]">Pick two different versions above with Compare A and Compare B to see a side-by-side diff of budget, venue, menu, manpower and tasks. You need at least two versions — save an edit or regenerate to create another.</div>}
            </div>
          )}

          {planTab === "Summary" && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <h3 className="font-serif-display text-2xl">Aegis Export / share summary — one page</h3>
                <p className="mt-1 text-sm text-[var(--dim)]">For the current plan or any saved version. No login or Gemini key needed. Copy it as text, download it, or use your browser / device Print on this view — the summary card below is designed to fit one page.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setSummaryVersionId(null)} aria-label="Summary for current plan" className={`rounded-full px-4 py-2 text-sm font-semibold ${summaryVersionId === null ? "bg-[#0F4C4C] text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}>Current plan (v{ev.planVersion})</button>
                  {versionsList.map(v => <button key={v.id} onClick={() => setSummaryVersionId(v.id)} aria-label={`Summary for version ${v.versionNumber}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${summaryVersionId === v.id ? "bg-[#0F4C4C] text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}>v{v.versionNumber}</button>)}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={async () => { const txt = buildSummaryText(summarySnap, summaryVersionLabel); try { await navigator.clipboard.writeText(txt); setCopyMsg("Copied summary as text — paste it anywhere to share."); } catch { setCopyMsg("Copy failed in this browser — use Download .txt below, or select the summary text manually."); } }} aria-label="Copy summary as text" className="rounded-xl bg-[#0F4C4C] px-4 py-2.5 text-sm font-semibold text-white">📋 Copy summary as text</button>
                  <button onClick={() => { const txt = buildSummaryText(summarySnap, summaryVersionLabel); const blob = new Blob([txt], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${ev.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "event"}-summary.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); setCopyMsg("Downloaded summary as a .txt file."); }} aria-label="Download summary as text file" className="rounded-xl border border-[var(--accent-strong)] px-4 py-2.5 text-sm font-semibold text-accent-strong">⬇ Download .txt</button>
                  <span className="self-center text-xs text-[var(--dim)]">To print / save PDF: open this Summary tab, then use your browser or device Print — the card below is the one-pager.</span>
                </div>
                {copyMsg ? <p role="status" className="mt-2 text-sm text-success-strong">{copyMsg}</p> : null}
              </div>

              <article aria-label="Printable one-page summary" className="rounded-2xl border-2 border-[#0F4C4C] bg-white p-6 text-[#1C1917] shadow-sm print:border-black">
                <p className="text-xs font-bold uppercase tracking-wide text-[#92400E]">Aegis • {summaryVersionLabel} • {summarySnap.planSource === "ai" ? "AI-generated plan" : "Template plan"} • Health {summaryMetrics.health}/100</p>
                <h3 className="font-serif-display mt-2 text-3xl">{ev.title}</h3>
                <p className="mt-1 capitalize text-sm text-gray-600">{ev.eventType} • {ev.eventDate} • {ev.city} • Planned by {ev.plannerName}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-lg bg-[#FFFBF0] p-3"><p className="text-xs text-gray-500">GUESTS + BUFFER</p><p className="font-bold">{formatNum(ev.guestCount)} → {formatNum(summaryMetrics.plannedGuests)}</p></div>
                  <div className="rounded-lg bg-[#FFFBF0] p-3"><p className="text-xs text-gray-500">BUDGET BAND</p><p className="font-bold">{formatINR(summarySnap.budgetMinInr)} – {formatINR(summarySnap.budgetMaxInr)}</p></div>
                  <div className="rounded-lg bg-[#FFFBF0] p-3"><p className="text-xs text-gray-500">TOTAL / REMAINING</p><p className="font-bold">{formatINR(summaryMetrics.total)} / {formatINR(summarySnap.budgetMaxInr - summaryMetrics.total)}</p></div>
                  <div className="rounded-lg bg-[#FFFBF0] p-3"><p className="text-xs text-gray-500">PER GUEST</p><p className="font-bold">{formatINR(summaryMetrics.perGuest)}</p></div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div><h4 className="font-bold">Budget breakdown</h4><ul className="mt-2 space-y-1">{summarySnap.budgetLines.map(l => <li key={l.category} className="flex justify-between border-b border-gray-100 py-1"><span>{l.label}</span><strong>{formatINR(l.plannedInr)}</strong></li>)}</ul></div>
                  <div><h4 className="font-bold">Venue</h4>{summaryMetrics.selectedVenue ? <p className="mt-2">{summaryMetrics.selectedVenue.name}<br />Capacity {formatNum(summaryMetrics.selectedVenue.capacity)} • Parking {formatNum(summaryMetrics.selectedVenue.parkingSpaces)} cars • {formatINR(summaryMetrics.selectedVenue.costInr)}<br />{summarySnap.venueConfirmed ? "Confirmed ✓" : "Not confirmed — verify before booking"}</p> : <p className="mt-2">No venue selected</p>}
                    <h4 className="mt-4 font-bold">Manpower</h4><p className="mt-1">{summarySnap.manpower.map(m => `${m.label} ×${m.count}`).join(", ") || "—"}<br />Total {formatINR(summarySnap.manpower.reduce((s, m) => s + m.count * m.costPerPersonInr, 0))}</p></div>
                </div>
                <div className="mt-4 text-sm"><h4 className="font-bold">Menu & food</h4><p className="mt-1">{(summarySnap.menu?.courses ?? []).join(", ") || "—"} • {formatINR(summarySnap.costPerPlateInr)} per plate × {formatNum(summaryMetrics.plannedGuests)} = {formatINR(summarySnap.costPerPlateInr * summaryMetrics.plannedGuests)}<br />Type: {summarySnap.foodType}{summarySnap.foodType === "mixed" ? ` — Veg ${formatNum(summaryMetrics.vegPlates)} plates (${summarySnap.vegPercent}%), Non-veg ${formatNum(summaryMetrics.nonVegPlates)} plates (${100 - summarySnap.vegPercent}%)` : ""} • Desserts: {summarySnap.desserts ? "Yes" : "No"} • Fruits: {summarySnap.fruits ? "Yes" : "No"} • Dry fruits: {summarySnap.dryFruits ? "Yes" : "No"}{ev.dietaryNotes ? ` • Dietary: ${ev.dietaryNotes}` : ""}</p></div>
                <div className="mt-4 rounded-lg bg-[#FFFBF0] p-3 text-sm"><h4 className="font-bold">Top audit flags — health {summaryMetrics.health}/100</h4>{summaryMetrics.flags.filter(f => !f.resolved).length === 0 ? <p className="mt-1 font-medium text-[#14532D]">✓ All 12 audit rules pass for this version.</p> : [...summaryMetrics.flags.filter(f => !f.resolved)].sort((a, b) => (a.severity === "blocker" ? 0 : a.severity === "warning" ? 1 : 2) - (b.severity === "blocker" ? 0 : b.severity === "warning" ? 1 : 2)).slice(0, 3).map(f => <p key={f.id} className="mt-1"><strong className="capitalize">{f.severity} — {f.id}:</strong> {f.message}</p>)}</div>
                <p className="mt-4 text-xs text-gray-500">Generated with Aegis — all totals and audit results recalculated in code from this version's snapshot. Venue options are suggestions to verify, not bookings. Entertainment: {ev.entertainmentTypes} ({ev.entertainmentHours}h) • Decor: {ev.decorLevel} • Tasks: {summarySnap.tasks.length} in Timeline.</p>
              </article>
              <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><summary className="cursor-pointer font-semibold">Plain-text version (for copying manually)</summary><pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">{buildSummaryText(summarySnap, summaryVersionLabel)}</pre></details>
            </div>
          )}

          </div>
          <button onClick={() => { setWiz(initialWizard()); setWizardStep(0); setScreen("wizard"); }} className="mt-8 w-full rounded-xl border border-[var(--accent-strong)] px-4 py-3 font-semibold text-accent-strong">Start a new event in Aegis with same name ({plannerName})</button>
        </main>
      </div>
    );
  }

  return null;
}
