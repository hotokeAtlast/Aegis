// AuditTab — plan tab. JSX moved verbatim from client/src/App.tsx;
// data arrives as explicit props from PlanScreen (same values,
// same handlers, only the navigation/callback names changed).
import { formatINR, PER_GUEST_FLOORS } from "../../../../server/src/planner-core";
import type { AuditFlag } from "../../../../server/src/planner-core";
import type { EventNonNull } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export function AuditTab({
  ev,
  auditFlags,
  health,
  totalPlanned,
  effectiveMax,
  unresolvedFlags,
  fixMessage,
  saveMsg,
  auditSeverityFilter,
  setAuditSeverityFilter,
  auditResolvedFilter,
  setAuditResolvedFilter,
  updateMut,
  onApplyFix,
}: {
  ev: EventNonNull;
  auditFlags: AuditFlag[];
  health: number;
  totalPlanned: number;
  effectiveMax: number;
  unresolvedFlags: AuditFlag[];
  fixMessage: string;
  saveMsg: string;
  auditSeverityFilter: string;
  setAuditSeverityFilter: Dispatch<SetStateAction<string>>;
  auditResolvedFilter: string;
  setAuditResolvedFilter: Dispatch<SetStateAction<string>>;
  updateMut: { isPending: boolean; isError: boolean; error: unknown };
  onApplyFix: (flag: AuditFlag) => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-serif-display text-2xl">Aegis Audit engine — all 12 rules, in code</h3>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Health score <strong>{health}/100</strong> = 100 − 25 per blocker − 10 per warning − 2 per info, floor 0. The
          score never hides flags: all 12 are listed below. Plan {ev.planSource} v{ev.planVersion} • Total{" "}
          {formatINR(totalPlanned)} vs max {formatINR(effectiveMax)} • Per-guest floor for {ev.eventType}:{" "}
          {formatINR(PER_GUEST_FLOORS[ev.eventType] ?? 1500)} • Servers ratio 1 per 20.
        </p>
        <p className="mt-2 rounded-lg bg-[var(--surface-alt)] p-3 text-sm">
          A flag only moves to <strong>Resolved</strong> after recalculation passes. There is{" "}
          <strong>no manual “mark resolved” button for blockers</strong> — use Apply fix, or fix it in its tab, and the
          engine rechecks.
        </p>
        {fixMessage ? (
          <div role="status" className="mt-3 rounded-lg border notice-info p-3 text-sm">
            {fixMessage}
          </div>
        ) : null}
        {saveMsg ? <p className="mt-2 text-sm text-success-strong">{saveMsg}</p> : null}
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-[var(--dim)]">FILTER BY SEVERITY</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All severities"],
                  ["blocker", "Blocker"],
                  ["warning", "Warning"],
                  ["info", "Info"],
                ] as [string, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setAuditSeverityFilter(val)}
                  aria-pressed={auditSeverityFilter === val}
                  aria-label={`Filter severity ${label}`}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${auditSeverityFilter === val ? "bg-[#0F4C4C] text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--dim)]">FILTER BY STATUS</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All flags"],
                  ["unresolved", "Unresolved"],
                  ["resolved", "Resolved"],
                ] as [string, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setAuditResolvedFilter(val)}
                  aria-pressed={auditResolvedFilter === val}
                  aria-label={`Filter status ${label}`}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${auditResolvedFilter === val ? "bg-[#B45309] text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-[var(--dim)]">
            Showing{" "}
            {
              auditFlags.filter(
                (f) =>
                  (auditSeverityFilter === "all" || f.severity === auditSeverityFilter) &&
                  (auditResolvedFilter === "all" || (auditResolvedFilter === "resolved" ? f.resolved : !f.resolved)),
              ).length
            }{" "}
            of 12 rules • {unresolvedFlags.length} unresolved (
            {unresolvedFlags.filter((f) => f.severity === "blocker").length} blocker,{" "}
            {unresolvedFlags.filter((f) => f.severity === "warning").length} warning,{" "}
            {unresolvedFlags.filter((f) => f.severity === "info").length} info)
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {auditFlags
            .filter(
              (f) =>
                (auditSeverityFilter === "all" || f.severity === auditSeverityFilter) &&
                (auditResolvedFilter === "all" || (auditResolvedFilter === "resolved" ? f.resolved : !f.resolved)),
            )
            .map((f) => (
              <div
                key={f.id}
                role="group"
                aria-label={`Audit rule ${f.id}, ${f.severity}, ${f.resolved ? "resolved" : "unresolved"}`}
                className={`rounded-xl border p-4 ${f.resolved ? "flag-resolved" : f.severity === "blocker" ? "flag-blocker" : f.severity === "warning" ? "flag-warning" : "flag-info"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${f.severity === "blocker" ? "bg-red-600 text-white" : f.severity === "warning" ? "chip-warning-solid" : "bg-blue-600 text-white"}`}
                  >
                    {f.severity}
                  </span>
                  <strong className="text-sm">{f.id}</strong>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${f.resolved ? "bg-green-600 text-white" : "bg-gray-800 text-white"}`}
                  >
                    {f.resolved ? "✓ Resolved" : "Unresolved"}
                  </span>
                </div>
                <p className="mt-2 text-sm">{f.message}</p>
                <p className="mt-1 text-sm flag-dim">
                  <strong>Suggested fix:</strong> {f.suggestedFix}
                </p>
                {!f.resolved ? (
                  <div className="mt-3">
                    <button
                      onClick={() => onApplyFix(f)}
                      disabled={updateMut.isPending}
                      aria-label={`Apply fix for ${f.id}`}
                      className="rounded-xl bg-[#0F4C4C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {updateMut.isPending ? "Applying & recalculating…" : `Apply fix: ${f.fixLabel}`}
                    </button>
                    <p className="mt-1.5 text-xs flag-dim">
                      One-click fix is applied in code and saved, then recalculated. If recalculation still fails, this
                      flag stays Unresolved with an explanation above — blockers cannot be manually marked resolved.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-semibold">
                    Resolved by recalculation — the underlying numbers now pass this rule.
                  </p>
                )}
              </div>
            ))}
          {auditFlags.filter(
            (f) =>
              (auditSeverityFilter === "all" || f.severity === auditSeverityFilter) &&
              (auditResolvedFilter === "all" || (auditResolvedFilter === "resolved" ? f.resolved : !f.resolved)),
          ).length === 0 ? (
            <p className="rounded-lg bg-[var(--surface-alt)] p-4 text-center text-sm text-[var(--dim)]">
              No flags match these filters. Try All severities / All flags.
            </p>
          ) : null}
          {ev.risks?.map((r, i) => (
            <p key={i} className="rounded-lg notice-warning p-3 text-sm">
              <strong>AI risk (not an audit rule):</strong> {r}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
