// OverviewTab — plan tab. JSX moved verbatim from client/src/App.tsx;
// data arrives as explicit props from PlanScreen (same values,
// same handlers, only the navigation/callback names changed).
import { FIELD_LIMITS, formatINR, formatNum } from "../../../../server/src/planner-core";
import type { AuditFlag, EditLine } from "../../../../server/src/planner-core";
import type { EventNonNull } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export function OverviewTab({
  ev,
  totalPlanned,
  effectiveMin,
  effectiveMax,
  remaining,
  perGuest,
  plannedGuests,
  selectedVenue,
  editVenueConfirmed,
  manpowerTotalLive,
  editLines,
  topFlags,
  health,
  regenSection,
  setRegenSection,
  regenInstruction,
  setRegenInstruction,
  regenMut,
  settings,
  onOpenAudit,
  onSettings,
}: {
  ev: EventNonNull;
  totalPlanned: number;
  effectiveMin: number;
  effectiveMax: number;
  remaining: number;
  perGuest: number;
  plannedGuests: number;
  selectedVenue: { name: string; capacity: number; parkingSpaces: number; costInr: number; kind: string } | null;
  editVenueConfirmed: boolean;
  manpowerTotalLive: number;
  editLines: EditLine[];
  topFlags: AuditFlag[];
  health: number;
  regenSection: string;
  setRegenSection: Dispatch<SetStateAction<string>>;
  regenInstruction: string;
  setRegenInstruction: Dispatch<SetStateAction<string>>;
  regenMut: { isPending: boolean; isError: boolean; error: unknown; mutate: () => void };
  settings: { hasKey: boolean; model: string } | undefined;
  onOpenAudit: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <h3 className="font-serif-display text-2xl">Aegis Overview</h3>
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm sm:grid-cols-3">
        <div>
          <p className="text-[var(--dim)]">Total planned</p>
          <p className="font-serif-display text-2xl">{formatINR(totalPlanned)}</p>
        </div>
        <div>
          <p className="text-[var(--dim)]">Budget minimum</p>
          <p className="font-serif-display text-2xl">{formatINR(effectiveMin)}</p>
        </div>
        <div>
          <p className="text-[var(--dim)]">Budget maximum</p>
          <p className="font-serif-display text-2xl">{formatINR(effectiveMax)}</p>
        </div>
        <div>
          <p className="text-[var(--dim)]">Remaining to max</p>
          <p className={`font-serif-display text-2xl ${remaining < 0 ? "text-danger-strong" : "text-success-strong"}`}>
            {formatINR(remaining)}
          </p>
        </div>
        <div>
          <p className="text-[var(--dim)]">Per-guest cost</p>
          <p className="font-serif-display text-2xl">{formatINR(perGuest)}</p>
        </div>
        <div>
          <p className="text-[var(--dim)]">Guests + 10% buffer</p>
          <p className="font-serif-display text-2xl">
            {formatNum(ev.guestCount)} → {formatNum(plannedGuests)}
          </p>
        </div>
        <div>
          <p className="text-[var(--dim)]">Plan health score</p>
          <p className="font-serif-display text-2xl">{health}/100</p>
        </div>
        <div>
          <p className="text-[var(--dim)]">Selected venue</p>
          <p className="font-semibold">{selectedVenue?.name ?? "None"}</p>
          <p className="text-xs">{editVenueConfirmed ? "Confirmed ✓" : "Not confirmed"}</p>
        </div>
        <div>
          <p className="text-[var(--dim)]">Manpower total (live)</p>
          <p className="font-serif-display text-2xl">{formatINR(manpowerTotalLive)}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-bold">Budget snapshot</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {editLines.map((l) => (
              <li key={l.category} className="flex justify-between">
                <span>{l.label}</span>
                <strong>{formatINR(l.plannedInr)}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-bold">Top 3 audit flags</h3>
          {topFlags.length === 0 ? (
            <p className="mt-3 rounded-lg notice-success p-3 text-sm">
              ✓ All 12 audit rules pass right now. Health {health}/100.
            </p>
          ) : (
            topFlags.map((f) => (
              <div
                key={f.id}
                className={`mt-2 rounded-lg p-3 text-sm ${f.severity === "blocker" ? "notice-danger" : f.severity === "warning" ? "notice-warning" : "notice-info"}`}
              >
                <strong className="capitalize">
                  {f.severity} — {f.id}:
                </strong>{" "}
                {f.message}
                <p className="mt-1 text-xs">Fix: {f.suggestedFix}</p>
              </div>
            ))
          )}
          <button
            onClick={() => onOpenAudit()}
            className="mt-3 rounded-full bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white"
          >
            Open full Audit (all 12 rules) →
          </button>
          <p className="mt-3 text-sm text-[var(--dim)]">
            Venue needed: {formatNum(plannedGuests)} capacity • Parking:{" "}
            {ev.needsParking ? `${ev.expectedCars} cars` : "Not needed"} • Food: {ev.foodType} • Decor: {ev.decorLevel}
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-bold">Next steps</h3>
        <p className="mt-2 text-sm text-[var(--dim)]">
          Edit Budget, Venue, Food, People or Timeline — every total and audit flag recalculates instantly in code, with
          no AI call on slider moves. Save each section to persist it.
        </p>
      </div>
      {(ev.aiNotes && ev.aiNotes.length) || (ev.risks && ev.risks.length) ? (
        <div className="rounded-2xl border notice-success p-5">
          <h3 className="font-bold">🤖 AI notes — trade-offs from {ev.aiModel}</h3>
          {ev.aiNotes?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {ev.aiNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          {ev.menu?.notes ? (
            <p className="mt-2 text-sm">
              <strong>Menu note:</strong> {ev.menu.notes}
            </p>
          ) : null}
          {ev.risks?.length ? (
            <div className="mt-3">
              <p className="text-sm font-semibold">Risks flagged by AI (verified in Audit tab):</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {ev.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-2 text-xs flag-dim">
            Venue options are AI suggestions to verify — not bookings. All numbers above were recalculated in code.
          </p>
        </div>
      ) : null}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-bold">↻ Regenerate with AI</h3>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Regenerate only a section where possible, otherwise the whole plan. Version will increment. If AI fails, it
          retries once and keeps your current plan with an explanation.
        </p>
        {!settings?.hasKey ? (
          <p className="mt-2 rounded-lg notice-warning p-3 text-sm">
            AI not connected yet —{" "}
            <button
              onClick={() => {
                onSettings();
              }}
              className="font-bold underline"
            >
              add your Gemini key in Settings
            </button>{" "}
            to enable regeneration.
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="regen-section" className="text-sm font-semibold">
              Section
            </label>
            <select
              id="regen-section"
              value={regenSection}
              onChange={(e) => setRegenSection(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            >
              <option value="all">Whole plan</option>
              <option value="budget">Budget only</option>
              <option value="venue">Venue only</option>
              <option value="food">Food / menu only</option>
              <option value="people">People only</option>
            </select>
          </div>
          <div>
            <label htmlFor="regen-instruction" className="text-sm font-semibold">
              Edit instruction (optional)
            </label>
            <input
              id="regen-instruction"
              maxLength={FIELD_LIMITS.regenInstruction}
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              placeholder="e.g. keep food, reduce decor"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            />
          </div>
        </div>
        <button
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending}
          className="mt-3 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {regenMut.isPending
            ? "Regenerating with Gemini…"
            : `Regenerate ${regenSection === "all" ? "whole plan" : regenSection} with AI`}
        </button>
        {regenMut.isError ? (
          <p role="alert" className="mt-2 text-sm text-danger-strong">
            {String((regenMut.error as Error)?.message || regenMut.error)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
