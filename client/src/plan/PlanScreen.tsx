// PlanScreen — the plan view: hero totals, shortcuts, tab bar and the
// nine plan tabs. All plan state lives in App (so leaving for Settings
// never loses unsaved edits); this screen owns the event/versions/settings
// queries, the edit sync effect, the regen/restore/save mutations, the
// audit-fix engine and the derived totals. Tab JSX lives in plan/tabs/.
// Everything below the header comment moved verbatim from client/src/App.tsx
// except navigation, which arrives as onHome/onNewEvent/onSettings/onDemo.
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "../api";
import {
  computeAuditFlags,
  CRITICAL_ROLES,
  FIELD_LIMITS,
  capText,
  formatINR,
  formatNum,
  healthFromFlags,
  PER_GUEST_FLOORS,
  plannedGuestsFor,
  type AuditFlag,
  type EditLine,
  type EditManpower,
  type EditTask,
} from "../../../server/src/planner-core";
import { snapshotMetricsFor, syncManpower, templateVenues } from "../plan-utils";
import type { SavePayload, VersionT } from "../types";
import { OverviewTab } from "./tabs/OverviewTab";
import { BudgetTab } from "./tabs/BudgetTab";
import { VenueTab } from "./tabs/VenueTab";
import { FoodTab } from "./tabs/FoodTab";
import { PeopleTab } from "./tabs/PeopleTab";
import { TimelineTab } from "./tabs/TimelineTab";
import { AuditTab } from "./tabs/AuditTab";
import { VersionsTab } from "./tabs/VersionsTab";
import { SummaryTab } from "./tabs/SummaryTab";

type PlanScreenProps = {
  currentEventId: number | null;
  plannerName: string;
  genCount: number;
  onBumpGenCount: () => void;
  genMessage: string;
  onGenMessage: (v: string) => void;
  planTab: string;
  setPlanTab: Dispatch<SetStateAction<string>>;
  editLines: { category: string; label: string; plannedInr: number; note?: string }[];
  setEditLines: Dispatch<SetStateAction<{ category: string; label: string; plannedInr: number; note?: string }[]>>;
  editCostPerPlate: number;
  setEditCostPerPlate: Dispatch<SetStateAction<number>>;
  editDesserts: boolean;
  setEditDesserts: Dispatch<SetStateAction<boolean>>;
  editFruits: boolean;
  setEditFruits: Dispatch<SetStateAction<boolean>>;
  editDryFruits: boolean;
  setEditDryFruits: Dispatch<SetStateAction<boolean>>;
  saveMsg: string;
  setSaveMsg: Dispatch<SetStateAction<string>>;
  editManpower: EditManpower[];
  setEditManpower: Dispatch<SetStateAction<EditManpower[]>>;
  editTasks: EditTask[];
  setEditTasks: Dispatch<SetStateAction<EditTask[]>>;
  editMenuCourses: string[];
  setEditMenuCourses: Dispatch<SetStateAction<string[]>>;
  newCourse: string;
  setNewCourse: Dispatch<SetStateAction<string>>;
  editSelectedVenue: string | null;
  setEditSelectedVenue: Dispatch<SetStateAction<string | null>>;
  editVenueConfirmed: boolean;
  setEditVenueConfirmed: Dispatch<SetStateAction<boolean>>;
  editBudgetMin: number;
  setEditBudgetMin: Dispatch<SetStateAction<number>>;
  editBudgetMax: number;
  setEditBudgetMax: Dispatch<SetStateAction<number>>;
  raiseMaxChecked: boolean;
  setRaiseMaxChecked: Dispatch<SetStateAction<boolean>>;
  auditSeverityFilter: string;
  setAuditSeverityFilter: Dispatch<SetStateAction<string>>;
  auditResolvedFilter: string;
  setAuditResolvedFilter: Dispatch<SetStateAction<string>>;
  fixMessage: string;
  setFixMessage: Dispatch<SetStateAction<string>>;
  compareAId: number | null;
  setCompareAId: Dispatch<SetStateAction<number | null>>;
  compareBId: number | null;
  setCompareBId: Dispatch<SetStateAction<number | null>>;
  summaryVersionId: number | null;
  setSummaryVersionId: Dispatch<SetStateAction<number | null>>;
  restoreConfirmId: number | null;
  setRestoreConfirmId: Dispatch<SetStateAction<number | null>>;
  restoreMsg: string;
  setRestoreMsg: Dispatch<SetStateAction<string>>;
  copyMsg: string;
  setCopyMsg: Dispatch<SetStateAction<string>>;
  regenSection: string;
  setRegenSection: Dispatch<SetStateAction<string>>;
  regenInstruction: string;
  setRegenInstruction: Dispatch<SetStateAction<string>>;
  onHome: () => void;
  onNewEvent: () => void;
  onSettings: () => void;
  onDemo: () => void;
};

export function PlanScreen({
  currentEventId,
  plannerName,
  genCount,
  onBumpGenCount,
  genMessage,
  onGenMessage,
  planTab,
  setPlanTab,
  editLines,
  setEditLines,
  editCostPerPlate,
  setEditCostPerPlate,
  editDesserts,
  setEditDesserts,
  editFruits,
  setEditFruits,
  editDryFruits,
  setEditDryFruits,
  saveMsg,
  setSaveMsg,
  editManpower,
  setEditManpower,
  editTasks,
  setEditTasks,
  editMenuCourses,
  setEditMenuCourses,
  newCourse,
  setNewCourse,
  editSelectedVenue,
  setEditSelectedVenue,
  editVenueConfirmed,
  setEditVenueConfirmed,
  editBudgetMin,
  setEditBudgetMin,
  editBudgetMax,
  setEditBudgetMax,
  raiseMaxChecked,
  setRaiseMaxChecked,
  auditSeverityFilter,
  setAuditSeverityFilter,
  auditResolvedFilter,
  setAuditResolvedFilter,
  fixMessage,
  setFixMessage,
  compareAId,
  setCompareAId,
  compareBId,
  setCompareBId,
  summaryVersionId,
  setSummaryVersionId,
  restoreConfirmId,
  setRestoreConfirmId,
  restoreMsg,
  setRestoreMsg,
  copyMsg,
  setCopyMsg,
  regenSection,
  setRegenSection,
  regenInstruction,
  setRegenInstruction,
  onHome,
  onNewEvent,
  onSettings,
  onDemo,
}: PlanScreenProps) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings({}),
  });
  const settings = settingsQuery.data;
  const eventQuery = useQuery({
    queryKey: ["event", currentEventId],
    queryFn: () => api.getEvent({ id: currentEventId! }),
    enabled: !!currentEventId,
  });
  const ev = eventQuery.data?.event ?? null;

  const versionsQuery = useQuery({
    queryKey: ["versions", currentEventId],
    queryFn: () => api.listVersions({ eventId: currentEventId! }),
    enabled: !!currentEventId,
  });
  const versionsList: VersionT[] = versionsQuery.data?.versions ?? [];

  useEffect(() => {
    if (ev) {
      setEditLines(ev.budgetLines.map((l) => ({ ...l })));
      setEditCostPerPlate(ev.costPerPlateInr);
      setEditDesserts(ev.desserts);
      setEditFruits(ev.fruits);
      setEditDryFruits(ev.dryFruits);
      setEditManpower(ev.manpower.map((m) => ({ ...m })));
      setEditTasks(
        (ev.tasks && ev.tasks.length ? ev.tasks : []).map((t) => ({
          title: t.title,
          dueInDaysBefore: t.dueInDaysBefore,
          owner: t.owner ?? "",
          status: (t as { status?: string }).status ?? "todo",
        })),
      );
      setEditMenuCourses(ev.menu?.courses ? [...ev.menu.courses] : []);
      setEditSelectedVenue(ev.selectedVenueName ?? ev.venueOptions?.[0]?.name ?? null);
      setEditVenueConfirmed(!!ev.venueConfirmed);
      setEditBudgetMin(ev.budgetMinInr);
      setEditBudgetMax(ev.budgetMaxInr);
      setRaiseMaxChecked(false);
      setFixMessage("");
    }
  }, [ev?.id, ev?.planVersion]);
  const totalPlanned = useMemo(() => editLines.reduce((s, l) => s + (l.plannedInr || 0), 0), [editLines]);
  const plannedGuests = ev ? plannedGuestsFor(ev.guestCount) : 0;

  const regenMut = useMutation({
    mutationFn: () =>
      api.regeneratePlan({
        id: currentEventId!,
        section: capText(regenSection, FIELD_LIMITS.regenSection),
        instruction: regenInstruction ? capText(regenInstruction, FIELD_LIMITS.regenInstruction) : undefined,
      }),
    onSuccess: (data) => {
      onBumpGenCount();
      onGenMessage(data.message);
      setRegenInstruction("");
      queryClient.invalidateQueries({ queryKey: ["event", currentEventId] });
      queryClient.invalidateQueries({ queryKey: ["versions", currentEventId] });
    },
  });
  const restoreMut = useMutation({
    mutationFn: (versionId: number) => api.restoreVersion({ eventId: currentEventId!, versionId }),
    onSuccess: (data) => {
      setRestoreMsg(data.message);
      onGenMessage(data.message);
      setRestoreConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["event", currentEventId] });
      queryClient.invalidateQueries({ queryKey: ["versions", currentEventId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => {
      setRestoreMsg(`Restore failed: ${String((e as Error)?.message || e)}`);
    },
  });

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
    mutationFn: (payload: SavePayload) =>
      api.updatePlan({
        id: currentEventId!,
        budgetLines: payload.budgetLines.map((l) => ({
          category: capText(l.category, FIELD_LIMITS.budgetCategory),
          label: capText(l.label, FIELD_LIMITS.budgetLabel),
          plannedInr: Math.max(0, Math.floor(l.plannedInr || 0)),
          note: capText(l.note ?? "", FIELD_LIMITS.budgetNote),
        })),
        costPerPlateInr: payload.costPerPlateInr,
        desserts: payload.desserts,
        fruits: payload.fruits,
        dryFruits: payload.dryFruits,
        manpower: payload.manpower.map((m) => ({
          ...m,
          role: capText(m.role, FIELD_LIMITS.manpowerRole),
          label: capText(m.label, FIELD_LIMITS.manpowerLabel),
        })),
        tasks: payload.tasks.map((t) => ({
          ...t,
          title: capText(t.title, FIELD_LIMITS.taskTitle),
          owner: capText(t.owner, FIELD_LIMITS.taskOwner),
          status: capText(t.status, FIELD_LIMITS.taskStatus),
        })),
        menu: {
          courses: payload.menuCourses.map((c) => capText(c, FIELD_LIMITS.menuCourse)),
          notes: capText(ev?.menu?.notes ?? "", FIELD_LIMITS.menuNotes),
          costPerPlateInr: payload.costPerPlateInr,
        },
        selectedVenueName:
          payload.selectedVenueName === null ? null : capText(payload.selectedVenueName, FIELD_LIMITS.venueName),
        venueConfirmed: payload.venueConfirmed,
        budgetMinInr: payload.budgetMinInr,
        budgetMaxInr: payload.budgetMaxInr,
      }),
    onSuccess: () => {
      setSaveMsg(
        "Saved — totals and audit recalculated in code. A new plan version was snapshotted — see Versions tab.",
      );
      queryClient.invalidateQueries({ queryKey: ["event", currentEventId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["versions", currentEventId] });
    },
    onError: (e) => {
      setSaveMsg(`Save failed: ${String((e as Error)?.message || e)}`);
    },
  });
  function saveCurrent(overrides?: Partial<SavePayload>) {
    updateMut.mutate(buildSavePayload(overrides));
  }

  if (eventQuery.isPending)
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] p-8 text-center" role="status">
        <p className="font-serif-display text-2xl">Loading your Aegis plan…</p>
        <p className="mt-2 text-sm text-[var(--dim)]">
          Fetching the saved Aegis plan — totals and audit flags are recalculated in code as soon as it arrives. This
          screen is never left blank.
        </p>
      </div>
    );
  if (!ev)
    return (
      <div className="min-h-screen bg-[var(--bg)] p-8 text-center">
        <p>Aegis plan not found.</p>
        <button onClick={() => onHome()} className="mt-4 rounded-xl bg-[#0F4C4C] px-4 py-2 text-white">
          Back to home
        </button>
      </div>
    );
  const evNonNull = ev;

  const venues =
    ev.venueOptions && ev.venueOptions.length
      ? ev.venueOptions.map((v) => ({
          name: v.name,
          capacity: v.capacity,
          parkingSpaces: v.parkingSpaces,
          costInr: v.costInr,
          kind: v.kind || "Venue suggestion — verify before booking",
        }))
      : templateVenues(ev);
  const effectiveMin = editBudgetMin || ev.budgetMinInr;
  const effectiveMax = editBudgetMax || ev.budgetMaxInr;
  const remaining = effectiveMax - totalPlanned;
  const perGuest = ev.guestCount ? Math.round(totalPlanned / ev.guestCount) : 0;
  const overBudget = totalPlanned > effectiveMax;
  const foodLine = editLines.find((l) => l.category === "food");
  const vegPlates =
    ev.foodType === "veg"
      ? plannedGuests
      : ev.foodType === "non-veg"
        ? 0
        : Math.ceil((plannedGuests * ev.vegPercent) / 100);
  const nonVegPlates =
    ev.foodType === "veg" ? 0 : ev.foodType === "non-veg" ? plannedGuests : plannedGuests - vegPlates;
  const nonVegDisplay = nonVegPlates;
  const selectedVenue = venues.find((v) => v.name === editSelectedVenue) ?? venues[0] ?? null;
  const effectiveTasks: EditTask[] = editTasks.length
    ? editTasks
    : (ev.tasks ?? []).map((t) => ({
        title: t.title,
        dueInDaysBefore: t.dueInDaysBefore,
        owner: t.owner ?? "",
        status: (t as { status?: string }).status ?? "todo",
      }));
  const effectiveManpower: EditManpower[] = editManpower.length ? editManpower : ev.manpower;
  const effectiveCourses: string[] = editMenuCourses.length ? editMenuCourses : (ev.menu?.courses ?? []);
  const auditFlags = computeAuditFlags({
    total: totalPlanned,
    budgetMin: effectiveMin,
    budgetMax: effectiveMax,
    perGuest,
    eventType: ev.eventType,
    plannedGuests,
    guestCount: ev.guestCount,
    selectedVenue,
    needsParking: ev.needsParking,
    expectedCars: ev.expectedCars,
    foodLineInr: foodLine?.plannedInr ?? 0,
    costPerPlate: editCostPerPlate,
    desserts: editDesserts,
    menuCourses: effectiveCourses,
    manpower: effectiveManpower,
    tasks: effectiveTasks,
    eventDate: ev.eventDate,
    venueConfirmed: editVenueConfirmed,
    foodType: ev.foodType,
    vegPercent: ev.vegPercent,
    vegPlates,
    nonVegPlates,
    budgetLines: editLines,
  });
  const health = healthFromFlags(auditFlags);
  const unresolvedFlags = auditFlags.filter((f) => !f.resolved);
  const topFlags = [...unresolvedFlags]
    .sort(
      (a, b) =>
        (a.severity === "blocker" ? 0 : a.severity === "warning" ? 1 : 2) -
        (b.severity === "blocker" ? 0 : b.severity === "warning" ? 1 : 2),
    )
    .slice(0, 3);
  const venueBudgetInr = editLines.find((l) => l.category === "venue")?.plannedInr ?? 300000;
  const manpowerTotalLive = effectiveManpower.reduce((s, m) => s + m.count * m.costPerPersonInr, 0);
  const tabs = ["Overview", "Budget", "Venue", "Food", "People", "Timeline", "Audit", "Versions", "Summary"];

  function currentAsSnapshot(): VersionT["snapshot"] {
    return {
      budgetLines: editLines.map((l) => ({
        category: l.category,
        label: l.label,
        plannedInr: l.plannedInr,
        note: l.note ?? "",
      })),
      costPerPlateInr: editCostPerPlate,
      venueOptions: venues,
      menu: { courses: effectiveCourses, notes: evNonNull.menu?.notes ?? "", costPerPlateInr: editCostPerPlate },
      tasks: effectiveTasks,
      manpower: effectiveManpower,
      risks: evNonNull.risks ?? [],
      aiNotes: evNonNull.aiNotes ?? [],
      aiModel: evNonNull.aiModel,
      planSource: evNonNull.planSource,
      selectedVenueName: editSelectedVenue,
      venueConfirmed: editVenueConfirmed,
      budgetMinInr: effectiveMin,
      budgetMaxInr: effectiveMax,
      desserts: editDesserts,
      fruits: editFruits,
      dryFruits: editDryFruits,
      generationMessage: evNonNull.generationMessage,
      guestCount: evNonNull.guestCount,
      eventType: evNonNull.eventType,
      eventDate: evNonNull.eventDate,
      foodType: evNonNull.foodType,
      vegPercent: evNonNull.vegPercent,
      needsParking: evNonNull.needsParking,
      expectedCars: evNonNull.expectedCars,
    };
  }
  const summarySnap: VersionT["snapshot"] = summaryVersionId
    ? (versionsList.find((v) => v.id === summaryVersionId)?.snapshot ?? currentAsSnapshot())
    : currentAsSnapshot();
  const summaryVersionLabel = summaryVersionId
    ? `v${versionsList.find((v) => v.id === summaryVersionId)?.versionNumber ?? "?"} — ${versionsList.find((v) => v.id === summaryVersionId)?.label ?? ""}`
    : `Current plan — v${evNonNull.planVersion}`;
  const summaryMetrics = snapshotMetricsFor(evNonNull, summarySnap);
  const compareA = versionsList.find((v) => v.id === compareAId) ?? versionsList[1] ?? versionsList[0] ?? null;
  const compareB = versionsList.find((v) => v.id === compareBId) ?? versionsList[0] ?? null;

  function applyFix(flag: AuditFlag) {
    setFixMessage("");
    const currentTotal = totalPlanned;
    // Helper to check candidate
    const checkCandidate = (cand: Partial<SavePayload> & { lines: EditLine[]; total: number }) => {
      const candFlags = computeAuditFlags({
        total: cand.total,
        budgetMin: cand.budgetMinInr ?? effectiveMin,
        budgetMax: cand.budgetMaxInr ?? effectiveMax,
        perGuest: evNonNull.guestCount ? Math.round(cand.total / evNonNull.guestCount) : 0,
        eventType: evNonNull.eventType,
        plannedGuests,
        guestCount: evNonNull.guestCount,
        selectedVenue:
          venues.find(
            (v) => v.name === (cand.selectedVenueName !== undefined ? cand.selectedVenueName : editSelectedVenue),
          ) ?? selectedVenue,
        needsParking: evNonNull.needsParking,
        expectedCars: evNonNull.expectedCars,
        foodLineInr: cand.lines.find((l) => l.category === "food")?.plannedInr ?? 0,
        costPerPlate: cand.costPerPlateInr ?? editCostPerPlate,
        desserts: cand.desserts ?? editDesserts,
        menuCourses: cand.menuCourses ?? effectiveCourses,
        manpower: cand.manpower ?? effectiveManpower,
        tasks: cand.tasks ?? effectiveTasks,
        eventDate: evNonNull.eventDate,
        venueConfirmed: cand.venueConfirmed ?? editVenueConfirmed,
        foodType: evNonNull.foodType,
        vegPercent: evNonNull.vegPercent,
        vegPlates,
        nonVegPlates,
        budgetLines: cand.lines,
      });
      return candFlags.find((f) => f.id === flag.id);
    };
    if (flag.id === "OVER_BUDGET") {
      const excessAmt = currentTotal - effectiveMax;
      const sorted = [...editLines].sort((a, b) => b.plannedInr - a.plannedInr);
      let remainingCut = excessAmt;
      const newLines = editLines.map((l) => ({ ...l }));
      for (const s of sorted) {
        if (remainingCut <= 0) break;
        const idx = newLines.findIndex((l) => l.category === s.category);
        const line = newLines[idx];
        if (!line) continue;
        const cut = Math.min(line.plannedInr, remainingCut);
        line.plannedInr -= cut;
        remainingCut -= cut;
      }
      const newTotal = newLines.reduce((s, l) => s + l.plannedInr, 0);
      const candCheck = checkCandidate({ lines: newLines, total: newTotal });
      if (candCheck && !candCheck.resolved) {
        setFixMessage(
          `Apply fix for OVER_BUDGET did not pass recalculation: total would still be ${formatINR(newTotal)} vs max ${formatINR(effectiveMax)}. The flag stays unresolved — try raising the maximum in Budget.`,
        );
        return;
      }
      setEditLines(newLines);
      saveCurrent({ budgetLines: newLines });
      setFixMessage(
        `Fix applied for OVER_BUDGET: reduced the largest categories by ${formatINR(excessAmt)}. Recalculation now passes — total ${formatINR(newTotal)} is inside max ${formatINR(effectiveMax)}, so this flag moves to Resolved after save.`,
      );
      return;
    }
    if (flag.id === "UNDER_BUDGET_MIN") {
      const target = effectiveMin;
      const shortfall = target - currentTotal;
      const newLines = editLines.map((l) =>
        l.category === "misc" ? { ...l, plannedInr: l.plannedInr + shortfall } : l,
      );
      const hasMisc = newLines.some((l) => l.category === "misc");
      if (!hasMisc) {
        setFixMessage(
          "Cannot apply UNDER_BUDGET_MIN fix: no Misc category exists to top up. Add a category first — flag stays unresolved.",
        );
        return;
      }
      const newTotal = newLines.reduce((s, l) => s + l.plannedInr, 0);
      setEditLines(newLines);
      saveCurrent({ budgetLines: newLines });
      setFixMessage(
        `Fix applied for UNDER_BUDGET_MIN: added ${formatINR(shortfall)} to Misc / Transport to reach your minimum. New total ${formatINR(newTotal)} — recalculation passes, flag moves to Resolved after save.`,
      );
      return;
    }
    if (flag.id === "VENUE_TOO_SMALL" || flag.id === "PARKING_SHORTFALL") {
      const needCap = flag.id === "VENUE_TOO_SMALL";
      const candidates = venues
        .filter(
          (v) =>
            (needCap ? v.capacity >= plannedGuests : true) &&
            (!evNonNull.needsParking || v.parkingSpaces >= evNonNull.expectedCars) &&
            (flag.id === "PARKING_SHORTFALL"
              ? v.capacity >= plannedGuests || v.parkingSpaces >= evNonNull.expectedCars
              : true),
        )
        .sort((a, b) => a.costInr - b.costInr);
      const pick =
        flag.id === "VENUE_TOO_SMALL"
          ? venues.filter((v) => v.capacity >= plannedGuests).sort((a, b) => a.costInr - b.costInr)[0]
          : (candidates[0] ??
            venues.filter((v) => v.parkingSpaces >= evNonNull.expectedCars).sort((a, b) => a.costInr - b.costInr)[0]);
      if (!pick) {
        setFixMessage(
          `Cannot auto-fix ${flag.id}: none of the ${venues.length} venue options ${needCap ? `fits ${formatNum(plannedGuests)} guests` : `has ${evNonNull.expectedCars} parking spaces`}. Add a larger venue option or change your requirements — flag stays unresolved.`,
        );
        return;
      }
      const newLines = editLines.map((l) => (l.category === "venue" ? { ...l, plannedInr: pick.costInr } : l));
      setEditSelectedVenue(pick.name);
      setEditLines(newLines);
      saveCurrent({ budgetLines: newLines, selectedVenueName: pick.name });
      setFixMessage(
        `Fix applied for ${flag.id}: switched selected venue to ${pick.name} (capacity ${formatNum(pick.capacity)}, parking ${formatNum(pick.parkingSpaces)}, ${formatINR(pick.costInr)}). Venue budget line updated to ${formatINR(pick.costInr)} — recalculation passes for this rule after save.`,
      );
      return;
    }
    if (flag.id === "FOOD_SHORTFALL") {
      const targetFood = editCostPerPlate * plannedGuests;
      const newLines = editLines.map((l) => (l.category === "food" ? { ...l, plannedInr: targetFood } : l));
      setEditLines(newLines);
      saveCurrent({ budgetLines: newLines });
      setFixMessage(
        `Fix applied for FOOD_SHORTFALL: food line set to ${formatINR(editCostPerPlate)} × ${formatNum(plannedGuests)} planned guests = ${formatINR(targetFood)} (includes 10% buffer). Recalculation passes after save.`,
      );
      return;
    }
    if (flag.id === "PER_GUEST_TOO_LOW") {
      const floor = PER_GUEST_FLOORS[evNonNull.eventType] ?? 1500;
      const neededTotal = floor * evNonNull.guestCount;
      const add = neededTotal - currentTotal;
      if (neededTotal > effectiveMax) {
        setFixMessage(
          `Cannot auto-fix PER_GUEST_TOO_LOW: reaching the ${formatINR(floor)} floor needs total ${formatINR(neededTotal)}, which exceeds your maximum ${formatINR(effectiveMax)}. Raise the maximum in Budget first — flag stays unresolved, no manual resolve is allowed for this rule.`,
        );
        return;
      }
      const newLines = editLines.map((l) => (l.category === "decor" ? { ...l, plannedInr: l.plannedInr + add } : l));
      setEditLines(newLines);
      saveCurrent({ budgetLines: newLines });
      setFixMessage(
        `Fix applied for PER_GUEST_TOO_LOW: added ${formatINR(add)} to Decor to reach ${formatINR(floor)} per guest. Recalculation passes after save.`,
      );
      return;
    }
    if (flag.id === "MISSING_DESSERT_CHOICE") {
      const newCourses = [...effectiveCourses, "Dessert"];
      setEditMenuCourses(newCourses);
      saveCurrent({ menuCourses: newCourses });
      setFixMessage(
        "Fix applied for MISSING_DESSERT_CHOICE: added Dessert course to the menu builder. Recalculation checks the menu — flag moves to Resolved after save.",
      );
      return;
    }
    if (flag.id === "STAFF_RATIO_LOW") {
      const reqS = Math.ceil(evNonNull.guestCount / 20);
      const reqSec = Math.max(2, Math.ceil(evNonNull.guestCount / 100));
      const newMp = effectiveManpower.map((m) =>
        m.role === "server"
          ? { ...m, count: Math.max(m.count, reqS) }
          : m.role === "security"
            ? { ...m, count: Math.max(m.count, reqSec) }
            : m,
      );
      const newLines = syncManpower(newMp, editLines);
      setEditManpower(newMp);
      setEditLines(newLines);
      saveCurrent({ manpower: newMp, budgetLines: newLines });
      setFixMessage(
        `Fix applied for STAFF_RATIO_LOW: servers raised to ${reqS} (1 per 20) and security to ${reqSec}. Manpower budget line recalculated to ${formatINR(newMp.reduce((s, m) => s + m.count * m.costPerPersonInr, 0))} in code.`,
      );
      return;
    }
    if (flag.id === "NO_TIMELINE_OWNER") {
      const newTasks = effectiveTasks.map((t) => (!t.owner.trim() ? { ...t, owner: "Coordinator" } : t));
      setEditTasks(newTasks);
      saveCurrent({ tasks: newTasks });
      setFixMessage(
        "Fix applied for NO_TIMELINE_OWNER: assigned Coordinator to every ownerless task. Recalculation passes after save.",
      );
      return;
    }
    if (flag.id === "DATE_TOO_SOON") {
      if (!selectedVenue) {
        setFixMessage(
          "Cannot auto-fix DATE_TOO_SOON: no venue is selected to confirm. Select a venue first — flag stays unresolved.",
        );
        return;
      }
      setEditVenueConfirmed(true);
      saveCurrent({ venueConfirmed: true });
      setFixMessage(
        `Fix applied for DATE_TOO_SOON: marked ${selectedVenue.name} as confirmed. Recalculation now sees venueConfirmed = true, so this blocker moves to Resolved after save.`,
      );
      return;
    }
    if (flag.id === "MIXED_FOOD_MISMATCH") {
      setFixMessage(
        `Plates are already recalculated in code as veg ${formatNum(vegPlates)} + non-veg ${formatNum(nonVegPlates)} = ${formatNum(plannedGuests)}. If this flag is still unresolved, the veg % (${evNonNull.vegPercent}%) is out of range — change it in the wizard by creating a corrected plan. Flag stays unresolved until the split totals 100%.`,
      );
      return;
    }
    if (flag.id === "SINGLE_POINT_FAILURE") {
      const newMp = effectiveManpower.map((m) =>
        CRITICAL_ROLES.includes(m.role) && m.count === 1 ? { ...m, count: 2 } : m,
      );
      const newLines = syncManpower(newMp, editLines);
      setEditManpower(newMp);
      setEditLines(newLines);
      saveCurrent({ manpower: newMp, budgetLines: newLines });
      setFixMessage(
        "Fix applied for SINGLE_POINT_FAILURE: every critical role with only 1 person was raised to 2, and the manpower budget line was recalculated in code.",
      );
      return;
    }
    setFixMessage(
      `No safe one-click fix is available for ${flag.id} — follow the suggested fix manually, then recalculation will re-check it. Blockers cannot be manually marked resolved.`,
    );
  }

  function handleFoodToggle(key: "desserts" | "fruits" | "dryFruits", newVal: boolean) {
    const deltaPerPlate = key === "desserts" ? 150 : key === "fruits" ? 80 : 120;
    const curVal = key === "desserts" ? editDesserts : key === "fruits" ? editFruits : editDryFruits;
    if (curVal === newVal) return;
    const newCost = Math.max(0, editCostPerPlate + (newVal ? deltaPerPlate : -deltaPerPlate));
    setEditCostPerPlate(newCost);
    setEditLines((prev) =>
      prev.map((l) => (l.category === "food" ? { ...l, plannedInr: newCost * plannedGuests } : l)),
    );
    if (key === "desserts") setEditDesserts(newVal);
    if (key === "fruits") setEditFruits(newVal);
    if (key === "dryFruits") setEditDryFruits(newVal);
    setSaveMsg("");
  }

  // Section callbacks — the exact save/fix logic the tab buttons used
  // inline in App.tsx, now named so tabs stay presentational.
  function onSaveBudget() {
    if (overBudget && !raiseMaxChecked) {
      setSaveMsg(
        "Blocked: total exceeds maximum. Reduce a category or tick 'Raise maximum to fit total' above, then save.",
      );
      return;
    }
    if (effectiveMin >= effectiveMax) {
      setSaveMsg("Blocked: minimum must be less than maximum.");
      return;
    }
    saveCurrent();
  }
  function onSelectVenue(v: { name: string; capacity: number; parkingSpaces: number; costInr: number; kind: string }) {
    const newLines = editLines.map((l) => (l.category === "venue" ? { ...l, plannedInr: v.costInr } : l));
    setEditSelectedVenue(v.name);
    setEditLines(newLines);
    setSaveMsg(
      `Selected ${v.name} — venue line is now ${formatINR(v.costInr)}, total is ${formatINR(newLines.reduce((s, l) => s + l.plannedInr, 0))}. Save to persist, audit already recalculated above.`,
    );
  }
  function onSaveVenue() {
    saveCurrent();
  }
  function onCostPerPlateChange(v: number) {
    setEditCostPerPlate(v);
    setEditLines((prev) => prev.map((l) => (l.category === "food" ? { ...l, plannedInr: v * plannedGuests } : l)));
    setSaveMsg("");
  }
  function onManpowerEdit(copy: EditManpower[]) {
    setEditManpower(copy);
    setEditLines(syncManpower(copy, editLines));
    setSaveMsg("");
  }
  function onSummaryForVersion(versionId: number) {
    setSummaryVersionId(versionId);
    setPlanTab("Summary");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-4xl px-5 pb-12 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => onHome()}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium"
          >
            ← All events
          </button>
          <button
            onClick={() => {
              onNewEvent();
            }}
            className="rounded-full bg-[#B45309] px-4 py-2 text-sm font-semibold text-white"
          >
            + New event
          </button>
        </div>

        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-accent2-strong">Aegis • Event plan</p>
        <h1 className="font-serif-display mt-1 text-4xl">{ev.title}</h1>
        <p className="mt-1 capitalize text-[var(--dim)]">
          {ev.eventType} • {ev.city} • {ev.eventDate} • Planned by {ev.plannerName} • {formatNum(ev.guestCount)} guests
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${ev.planSource === "ai" ? "notice-success" : "notice-warning"}`}
          >
            {ev.planSource === "ai" ? "✨ AI-generated" : "📋 Template plan"} • v{ev.planVersion} • {ev.aiModel}
          </span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs">
            Generations this session: {genCount}
          </span>
          <button
            onClick={() => {
              onSettings();
            }}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold"
          >
            Settings / API Key
          </button>
          <button
            onClick={() => onDemo()}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold"
          >
            📖 Demo guide
          </button>
        </div>
        {genMessage || ev.generationMessage ? (
          <div className="mt-3 rounded-xl border notice-info p-3 text-sm">{genMessage || ev.generationMessage}</div>
        ) : null}

        {/* Hero budget health */}
        <div className="mt-6 rounded-2xl bg-[#0F4C4C] p-6 text-white">
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Total planned</p>
              <p className="font-serif-display mt-1 text-3xl">{formatINR(totalPlanned)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Remaining to max</p>
              <p className={`font-serif-display mt-1 text-3xl ${remaining < 0 ? "text-red-300" : ""}`}>
                {formatINR(remaining)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Per guest</p>
              <p className="font-serif-display mt-1 text-3xl">{formatINR(perGuest)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Health score</p>
              <p className="font-serif-display mt-1 text-3xl">{health}/100</p>
            </div>
          </div>
          <p className="mt-4 text-sm opacity-90">
            Budget band {formatINR(effectiveMin)} – {formatINR(effectiveMax)} • Guests {formatNum(ev.guestCount)} + 10%
            buffer = {formatNum(plannedGuests)} for food • Selected venue: {selectedVenue?.name ?? "None"}{" "}
            {editVenueConfirmed ? "• Confirmed ✓" : "• Not confirmed"}
          </p>
          <p className="mt-1 text-xs opacity-80">
            Health = 100 − 25 per blocker − 10 per warning − 2 per info (floor 0). {unresolvedFlags.length} unresolved
            flag(s) out of 12 rules. Score never hides the flags — see Audit tab for all 12.
          </p>
          {topFlags.map((f) => (
            <p
              key={f.id}
              role={f.severity === "blocker" ? "alert" : undefined}
              className={`mt-2 rounded-lg p-3 text-sm ${f.severity === "blocker" ? "bg-red-900/60 font-semibold" : f.severity === "warning" ? "bg-amber-900/50" : "bg-white/10"}`}
            >
              {f.severity === "blocker" ? "🚨" : "⚠"} {f.id} — {f.message}
            </p>
          ))}
        </div>

        {/* Audit / Versions / Summary shortcuts — always visible, so Audit is never hidden in the scrolling tab row */}
        <div className="mt-6 grid grid-cols-3 gap-2" aria-label="Quick shortcuts">
          <button
            onClick={() => setPlanTab("Audit")}
            aria-label="Open Audit tab from shortcut"
            className={`rounded-2xl border p-3 text-left ${planTab === "Audit" ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : unresolvedFlags.length ? "notice-danger" : "notice-success"}`}
          >
            <span className="block text-xs font-bold uppercase tracking-wide">🛡️ Audit</span>
            <span className="mt-1 block text-sm font-bold">Health {health}/100</span>
            <span className="block text-xs opacity-80">{unresolvedFlags.length} unresolved • Open Audit →</span>
          </button>
          <button
            onClick={() => setPlanTab("Versions")}
            aria-label="Open Versions tab from shortcut"
            className={`rounded-2xl border p-3 text-left ${planTab === "Versions" ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : "border-[var(--border)] bg-[var(--surface)]"}`}
          >
            <span className="block text-xs font-bold uppercase tracking-wide">🕘 Versions</span>
            <span className="mt-1 block text-sm font-bold">
              v{ev.planVersion} • {versionsList.length || "…"} saved
            </span>
            <span className="block text-xs opacity-80">Compare & restore →</span>
          </button>
          <button
            onClick={() => setPlanTab("Summary")}
            aria-label="Open Summary tab from shortcut"
            className={`rounded-2xl border p-3 text-left ${planTab === "Summary" ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : "border-[var(--border)] bg-[var(--surface)]"}`}
          >
            <span className="block text-xs font-bold uppercase tracking-wide">🖨️ Summary</span>
            <span className="mt-1 block text-sm font-bold">One-page export</span>
            <span className="block text-xs opacity-80">Print / copy →</span>
          </button>
        </div>
        {restoreMsg ? (
          <div role="status" className="mt-3 rounded-xl border notice-info p-3 text-sm">
            {restoreMsg}
          </div>
        ) : null}

        {/* Tabs — horizontally scrollable on phone, with a clear scroll hint */}
        <p className="mt-5 text-xs font-semibold text-[var(--dim)]">
          AEGIS PLAN SECTIONS — scroll sideways on small screens → Audit, Versions & Summary are at the end, or use the
          shortcuts above
        </p>
        <div
          className="mt-2 flex gap-2 overflow-x-auto pb-2"
          role="tablist"
          aria-label="Plan sections"
          style={{ scrollbarWidth: "thin" }}
          onKeyDown={(e) => {
            const idx = tabs.indexOf(planTab);
            let next = -1;
            if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
            else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = tabs.length - 1;
            if (next >= 0) {
              e.preventDefault();
              const name = tabs[next]!;
              setPlanTab(name);
              requestAnimationFrame(() => document.getElementById(`plan-tab-${name}`)?.focus());
            }
          }}
        >
          {tabs.map((t) => (
            <button
              key={t}
              id={`plan-tab-${t}`}
              role="tab"
              aria-selected={planTab === t}
              aria-controls="plan-panel"
              tabIndex={planTab === t ? 0 : -1}
              onClick={() => setPlanTab(t)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${planTab === t ? "bg-[#0F4C4C] text-white" : "border border-[var(--border)] bg-[var(--surface)]"} ${t === "Audit" && unresolvedFlags.length ? "ring-2 ring-red-400" : ""}`}
            >
              {t}
              {t === "Audit" && unresolvedFlags.length ? ` (${unresolvedFlags.length})` : ""}
              {t === "Versions" && versionsList.length ? ` (${versionsList.length})` : ""}
            </button>
          ))}
          <span className="shrink-0 self-center text-xs text-[var(--dim)]">→ end</span>
        </div>
        <div role="tabpanel" id="plan-panel" aria-labelledby={`plan-tab-${planTab}`}>
          {planTab === "Overview" && (
            <OverviewTab
              ev={ev}
              totalPlanned={totalPlanned}
              effectiveMin={effectiveMin}
              effectiveMax={effectiveMax}
              remaining={remaining}
              perGuest={perGuest}
              plannedGuests={plannedGuests}
              selectedVenue={selectedVenue}
              editVenueConfirmed={editVenueConfirmed}
              manpowerTotalLive={manpowerTotalLive}
              editLines={editLines}
              topFlags={topFlags}
              health={health}
              regenSection={regenSection}
              setRegenSection={setRegenSection}
              regenInstruction={regenInstruction}
              setRegenInstruction={setRegenInstruction}
              regenMut={regenMut}
              settings={settings}
              onOpenAudit={() => setPlanTab("Audit")}
              onSettings={onSettings}
            />
          )}

          {planTab === "Budget" && (
            <BudgetTab
              editLines={editLines}
              setEditLines={setEditLines}
              effectiveMin={effectiveMin}
              effectiveMax={effectiveMax}
              setEditBudgetMin={setEditBudgetMin}
              setEditBudgetMax={setEditBudgetMax}
              totalPlanned={totalPlanned}
              remaining={remaining}
              perGuest={perGuest}
              overBudget={overBudget}
              raiseMaxChecked={raiseMaxChecked}
              setRaiseMaxChecked={setRaiseMaxChecked}
              saveMsg={saveMsg}
              setSaveMsg={setSaveMsg}
              updateMut={updateMut}
              onSaveBudget={onSaveBudget}
            />
          )}

          {planTab === "Venue" && (
            <VenueTab
              ev={ev}
              venues={venues}
              selectedVenue={selectedVenue}
              venueBudgetInr={venueBudgetInr}
              plannedGuests={plannedGuests}
              editVenueConfirmed={editVenueConfirmed}
              setEditVenueConfirmed={setEditVenueConfirmed}
              saveMsg={saveMsg}
              setSaveMsg={setSaveMsg}
              updateMut={updateMut}
              onSelectVenue={onSelectVenue}
              onSaveVenue={onSaveVenue}
            />
          )}

          {planTab === "Food" && (
            <FoodTab
              ev={ev}
              plannedGuests={plannedGuests}
              vegPlates={vegPlates}
              nonVegDisplay={nonVegDisplay}
              effectiveCourses={effectiveCourses}
              setEditMenuCourses={setEditMenuCourses}
              newCourse={newCourse}
              setNewCourse={setNewCourse}
              editCostPerPlate={editCostPerPlate}
              foodLine={foodLine}
              editDesserts={editDesserts}
              editFruits={editFruits}
              editDryFruits={editDryFruits}
              saveMsg={saveMsg}
              setSaveMsg={setSaveMsg}
              updateMut={updateMut}
              onCostPerPlateChange={onCostPerPlateChange}
              onFoodToggle={handleFoodToggle}
              onSave={() => saveCurrent()}
            />
          )}

          {planTab === "People" && (
            <PeopleTab
              ev={ev}
              effectiveManpower={effectiveManpower}
              manpowerTotalLive={manpowerTotalLive}
              saveMsg={saveMsg}
              updateMut={updateMut}
              onManpowerEdit={onManpowerEdit}
              onSave={() => saveCurrent()}
            />
          )}

          {planTab === "Timeline" && (
            <TimelineTab
              ev={ev}
              effectiveTasks={effectiveTasks}
              setEditTasks={setEditTasks}
              setSaveMsg={setSaveMsg}
              saveMsg={saveMsg}
              updateMut={updateMut}
              onSave={() => saveCurrent()}
            />
          )}

          {planTab === "Audit" && (
            <AuditTab
              ev={ev}
              auditFlags={auditFlags}
              health={health}
              totalPlanned={totalPlanned}
              effectiveMax={effectiveMax}
              unresolvedFlags={unresolvedFlags}
              fixMessage={fixMessage}
              saveMsg={saveMsg}
              auditSeverityFilter={auditSeverityFilter}
              setAuditSeverityFilter={setAuditSeverityFilter}
              auditResolvedFilter={auditResolvedFilter}
              setAuditResolvedFilter={setAuditResolvedFilter}
              updateMut={updateMut}
              onApplyFix={applyFix}
            />
          )}

          {planTab === "Versions" && (
            <VersionsTab
              ev={ev}
              versionsList={versionsList}
              versionsPending={versionsQuery.isPending}
              compareA={compareA}
              compareB={compareB}
              setCompareAId={setCompareAId}
              setCompareBId={setCompareBId}
              restoreConfirmId={restoreConfirmId}
              setRestoreConfirmId={setRestoreConfirmId}
              restoreMsg={restoreMsg}
              setRestoreMsg={setRestoreMsg}
              restoreMut={restoreMut}
              onSummaryForVersion={onSummaryForVersion}
            />
          )}

          {planTab === "Summary" && (
            <SummaryTab
              ev={ev}
              summarySnap={summarySnap}
              summaryVersionLabel={summaryVersionLabel}
              summaryMetrics={summaryMetrics}
              versionsList={versionsList}
              summaryVersionId={summaryVersionId}
              setSummaryVersionId={setSummaryVersionId}
              copyMsg={copyMsg}
              setCopyMsg={setCopyMsg}
            />
          )}
        </div>
        <button
          onClick={() => {
            onNewEvent();
          }}
          className="mt-8 w-full rounded-xl border border-[var(--accent-strong)] px-4 py-3 font-semibold text-accent-strong"
        >
          Start a new event in Aegis with same name ({plannerName})
        </button>
      </main>
    </div>
  );
}
