// SummaryTab — plan tab. JSX moved verbatim from client/src/App.tsx;
// data arrives as explicit props from PlanScreen (same values,
// same handlers, only the navigation/callback names changed).
import { formatINR, formatNum, type SnapshotMetrics } from "../../../../server/src/planner-core";
import type { EventNonNull, VersionT } from "../../types";
import { buildSummaryText } from "../../plan-utils";
import type { Dispatch, SetStateAction } from "react";

export function SummaryTab({
  ev,
  summarySnap,
  summaryVersionLabel,
  summaryMetrics,
  versionsList,
  summaryVersionId,
  setSummaryVersionId,
  copyMsg,
  setCopyMsg,
}: {
  ev: EventNonNull;
  summarySnap: VersionT["snapshot"];
  summaryVersionLabel: string;
  summaryMetrics: SnapshotMetrics;
  versionsList: VersionT[];
  summaryVersionId: number | null;
  setSummaryVersionId: Dispatch<SetStateAction<number | null>>;
  copyMsg: string;
  setCopyMsg: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-serif-display text-2xl">Aegis Export / share summary — one page</h3>
        <p className="mt-1 text-sm text-[var(--dim)]">
          For the current plan or any saved version. No login or Gemini key needed. Copy it as text, download it, or use
          your browser / device Print on this view — the summary card below is designed to fit one page.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setSummaryVersionId(null)}
            aria-label="Summary for current plan"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${summaryVersionId === null ? "bg-[#0F4C4C] text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}
          >
            Current plan (v{ev.planVersion})
          </button>
          {versionsList.map((v) => (
            <button
              key={v.id}
              onClick={() => setSummaryVersionId(v.id)}
              aria-label={`Summary for version ${v.versionNumber}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${summaryVersionId === v.id ? "bg-[#0F4C4C] text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}
            >
              v{v.versionNumber}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              const txt = buildSummaryText(ev, summarySnap, summaryVersionLabel);
              try {
                await navigator.clipboard.writeText(txt);
                setCopyMsg("Copied summary as text — paste it anywhere to share.");
              } catch {
                setCopyMsg(
                  "Copy failed in this browser — use Download .txt below, or select the summary text manually.",
                );
              }
            }}
            aria-label="Copy summary as text"
            className="rounded-xl bg-[#0F4C4C] px-4 py-2.5 text-sm font-semibold text-white"
          >
            📋 Copy summary as text
          </button>
          <button
            onClick={() => {
              const txt = buildSummaryText(ev, summarySnap, summaryVersionLabel);
              const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${ev.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "event"}-summary.txt`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              setCopyMsg("Downloaded summary as a .txt file.");
            }}
            aria-label="Download summary as text file"
            className="rounded-xl border border-[var(--accent-strong)] px-4 py-2.5 text-sm font-semibold text-accent-strong"
          >
            ⬇ Download .txt
          </button>
          <span className="self-center text-xs text-[var(--dim)]">
            To print / save PDF: open this Summary tab, then use your browser or device Print — the card below is the
            one-pager.
          </span>
        </div>
        {copyMsg ? (
          <p role="status" className="mt-2 text-sm text-success-strong">
            {copyMsg}
          </p>
        ) : null}
      </div>

      <article
        aria-label="Printable one-page summary"
        className="rounded-2xl border-2 border-[#0F4C4C] bg-white p-6 text-[#1C1917] shadow-sm print:border-black"
      >
        <p className="text-xs font-bold uppercase tracking-wide text-[#92400E]">
          Aegis • {summaryVersionLabel} • {summarySnap.planSource === "ai" ? "AI-generated plan" : "Template plan"} •
          Health {summaryMetrics.health}/100
        </p>
        <h3 className="font-serif-display mt-2 text-3xl">{ev.title}</h3>
        <p className="mt-1 capitalize text-sm text-gray-600">
          {ev.eventType} • {ev.eventDate} • {ev.city} • Planned by {ev.plannerName}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-lg bg-[#FFFBF0] p-3">
            <p className="text-xs text-gray-500">GUESTS + BUFFER</p>
            <p className="font-bold">
              {formatNum(ev.guestCount)} → {formatNum(summaryMetrics.plannedGuests)}
            </p>
          </div>
          <div className="rounded-lg bg-[#FFFBF0] p-3">
            <p className="text-xs text-gray-500">BUDGET BAND</p>
            <p className="font-bold">
              {formatINR(summarySnap.budgetMinInr)} – {formatINR(summarySnap.budgetMaxInr)}
            </p>
          </div>
          <div className="rounded-lg bg-[#FFFBF0] p-3">
            <p className="text-xs text-gray-500">TOTAL / REMAINING</p>
            <p className="font-bold">
              {formatINR(summaryMetrics.total)} / {formatINR(summarySnap.budgetMaxInr - summaryMetrics.total)}
            </p>
          </div>
          <div className="rounded-lg bg-[#FFFBF0] p-3">
            <p className="text-xs text-gray-500">PER GUEST</p>
            <p className="font-bold">{formatINR(summaryMetrics.perGuest)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <h4 className="font-bold">Budget breakdown</h4>
            <ul className="mt-2 space-y-1">
              {summarySnap.budgetLines.map((l) => (
                <li key={l.category} className="flex justify-between border-b border-gray-100 py-1">
                  <span>{l.label}</span>
                  <strong>{formatINR(l.plannedInr)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold">Venue</h4>
            {summaryMetrics.selectedVenue ? (
              <p className="mt-2">
                {summaryMetrics.selectedVenue.name}
                <br />
                Capacity {formatNum(summaryMetrics.selectedVenue.capacity)} • Parking{" "}
                {formatNum(summaryMetrics.selectedVenue.parkingSpaces)} cars •{" "}
                {formatINR(summaryMetrics.selectedVenue.costInr)}
                <br />
                {summarySnap.venueConfirmed ? "Confirmed ✓" : "Not confirmed — verify before booking"}
              </p>
            ) : (
              <p className="mt-2">No venue selected</p>
            )}
            <h4 className="mt-4 font-bold">Manpower</h4>
            <p className="mt-1">
              {summarySnap.manpower.map((m) => `${m.label} ×${m.count}`).join(", ") || "—"}
              <br />
              Total {formatINR(summarySnap.manpower.reduce((s, m) => s + m.count * m.costPerPersonInr, 0))}
            </p>
          </div>
        </div>
        <div className="mt-4 text-sm">
          <h4 className="font-bold">Menu & food</h4>
          <p className="mt-1">
            {(summarySnap.menu?.courses ?? []).join(", ") || "—"} • {formatINR(summarySnap.costPerPlateInr)} per plate ×{" "}
            {formatNum(summaryMetrics.plannedGuests)} ={" "}
            {formatINR(summarySnap.costPerPlateInr * summaryMetrics.plannedGuests)}
            <br />
            Type: {summarySnap.foodType}
            {summarySnap.foodType === "mixed"
              ? ` — Veg ${formatNum(summaryMetrics.vegPlates)} plates (${summarySnap.vegPercent}%), Non-veg ${formatNum(summaryMetrics.nonVegPlates)} plates (${100 - summarySnap.vegPercent}%)`
              : ""}{" "}
            • Desserts: {summarySnap.desserts ? "Yes" : "No"} • Fruits: {summarySnap.fruits ? "Yes" : "No"} • Dry
            fruits: {summarySnap.dryFruits ? "Yes" : "No"}
            {ev.dietaryNotes ? ` • Dietary: ${ev.dietaryNotes}` : ""}
          </p>
        </div>
        <div className="mt-4 rounded-lg bg-[#FFFBF0] p-3 text-sm">
          <h4 className="font-bold">Top audit flags — health {summaryMetrics.health}/100</h4>
          {summaryMetrics.flags.filter((f) => !f.resolved).length === 0 ? (
            <p className="mt-1 font-medium text-[#14532D]">✓ All 12 audit rules pass for this version.</p>
          ) : (
            [...summaryMetrics.flags.filter((f) => !f.resolved)]
              .sort(
                (a, b) =>
                  (a.severity === "blocker" ? 0 : a.severity === "warning" ? 1 : 2) -
                  (b.severity === "blocker" ? 0 : b.severity === "warning" ? 1 : 2),
              )
              .slice(0, 3)
              .map((f) => (
                <p key={f.id} className="mt-1">
                  <strong className="capitalize">
                    {f.severity} — {f.id}:
                  </strong>{" "}
                  {f.message}
                </p>
              ))
          )}
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Generated with Aegis — all totals and audit results recalculated in code from this version's snapshot. Venue
          options are suggestions to verify, not bookings. Entertainment: {ev.entertainmentTypes} (
          {ev.entertainmentHours}h) • Decor: {ev.decorLevel} • Tasks: {summarySnap.tasks.length} in Timeline.
        </p>
      </article>
      <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <summary className="cursor-pointer font-semibold">Plain-text version (for copying manually)</summary>
        <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">
          {buildSummaryText(ev, summarySnap, summaryVersionLabel)}
        </pre>
      </details>
    </div>
  );
}
