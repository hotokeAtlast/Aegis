// VenueTab — plan tab. JSX moved verbatim from client/src/App.tsx;
// data arrives as explicit props from PlanScreen (same values,
// same handlers, only the navigation/callback names changed).
import { formatINR, formatNum, venueFitScore } from "../../../../server/src/planner-core";
import type { templateVenues } from "../../plan-utils";
import type { EventNonNull } from "../../types";
import type { Dispatch, SetStateAction } from "react";

type VenueOption = ReturnType<typeof templateVenues>[number];

export function VenueTab({
  ev,
  venues,
  selectedVenue,
  venueBudgetInr,
  plannedGuests,
  editVenueConfirmed,
  setEditVenueConfirmed,
  saveMsg,
  setSaveMsg,
  updateMut,
  onSelectVenue,
  onSaveVenue,
}: {
  ev: EventNonNull;
  venues: VenueOption[];
  selectedVenue: VenueOption | null;
  venueBudgetInr: number;
  plannedGuests: number;
  editVenueConfirmed: boolean;
  setEditVenueConfirmed: Dispatch<SetStateAction<boolean>>;
  saveMsg: string;
  setSaveMsg: Dispatch<SetStateAction<string>>;
  updateMut: { isPending: boolean; isError: boolean; error: unknown };
  onSelectVenue: (v: VenueOption) => void;
  onSaveVenue: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <h3 className="font-serif-display text-2xl">Aegis Venue — suggestions & fit scores</h3>
      <p className="text-sm text-[var(--dim)]">
        {ev.planSource === "ai"
          ? "Aegis AI suggestions — verify capacity & price before booking."
          : "Aegis template suggestions — verify capacity & price before booking."}{" "}
        Need: <strong>{formatNum(plannedGuests)} capacity</strong>
        {ev.needsParking ? `, ${ev.expectedCars} parking spaces` : ""}. Preference: {ev.venuePref}
        {ev.areaPreference ? ` • ${ev.areaPreference}` : ""} Fit score = capacity 50 + parking 30 + cost vs venue budget
        20.
      </p>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="flex-1 text-sm">
          Selected: <strong>{selectedVenue?.name ?? "None"}</strong> • Venue budget line:{" "}
          <strong>{formatINR(venueBudgetInr)}</strong> •{" "}
          {editVenueConfirmed ? "Venue confirmed ✓" : "Venue not confirmed"}
        </p>
        <button
          onClick={() => {
            const next = !editVenueConfirmed;
            setEditVenueConfirmed(next);
            setSaveMsg("");
          }}
          aria-label="Toggle venue confirmed"
          className={`rounded-full px-4 py-2 text-sm font-semibold ${editVenueConfirmed ? "bg-teal-600 text-white" : "border border-[var(--border)] bg-[var(--bg)]"}`}
        >
          {editVenueConfirmed ? "Venue confirmed ✓" : "Mark venue confirmed"}
        </button>
        <button
          onClick={onSaveVenue}
          disabled={updateMut.isPending}
          className="rounded-full bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save venue selection
        </button>
      </div>
      {saveMsg ? (
        <p role="status" aria-live="polite" className="text-center text-sm text-success-strong">
          {saveMsg}
        </p>
      ) : null}
      {venues.map((v) => {
        const tooSmall = v.capacity < plannedGuests;
        const parkingShort = ev.needsParking && v.parkingSpaces < ev.expectedCars;
        const fit = venueFitScore(v, plannedGuests, ev.needsParking, ev.expectedCars, venueBudgetInr);
        const isSelected = selectedVenue?.name === v.name;
        return (
          <div
            key={v.name}
            className={`rounded-2xl border p-5 ${tooSmall ? "notice-danger" : "border-[var(--border)] bg-[var(--surface)]"} ${isSelected ? "ring-2 ring-[#0F4C4C]" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">
                  {v.name}{" "}
                  {isSelected ? (
                    <span className="ml-1 rounded-full bg-[#0F4C4C] px-2 py-0.5 text-xs text-white">Selected</span>
                  ) : null}
                </h3>
                <p className="text-sm text-[var(--dim)]">{v.kind}</p>
              </div>
              <div className="text-right">
                <span className="font-serif-display text-xl">{formatINR(v.costInr)}</span>
                <p className="text-sm font-bold text-accent-strong">Fit score: {fit}/100</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <span>
                Capacity: <strong>{formatNum(v.capacity)}</strong>
              </span>
              <span>
                Parking: <strong>{formatNum(v.parkingSpaces)} cars</strong>
              </span>
              <span>
                Cost: <strong>{formatINR(v.costInr)}</strong>
              </span>
              <span>
                Fit score: <strong>{fit}/100</strong>
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full bg-[#0F4C4C]" style={{ width: `${fit}%` }} />
            </div>
            {tooSmall ? (
              <p role="alert" className="mt-3 rounded-lg notice-danger p-2.5 text-sm font-medium">
                ⚠ Mismatch — VENUE_TOO_SMALL: needs {formatNum(plannedGuests)}, this holds {formatNum(v.capacity)}. Pick
                a larger venue.
              </p>
            ) : (
              <p className="mt-3 text-sm text-success-strong">✓ Fits guests + buffer</p>
            )}
            {parkingShort ? (
              <p className="mt-1 rounded-lg notice-warning p-2.5 text-sm">
                ⚠ Parking shortfall — PARKING_SHORTFALL: need {ev.expectedCars} cars, has {v.parkingSpaces}.
              </p>
            ) : null}
            <button
              onClick={() => onSelectVenue(v)}
              aria-label={`Select venue ${v.name}`}
              disabled={isSelected}
              className="mt-3 w-full rounded-xl bg-[#0F4C4C] px-4 py-2.5 font-semibold text-white disabled:opacity-40"
            >
              {isSelected ? "Selected — totals use this venue" : `Select ${v.name} — update totals & audit`}
            </button>
          </div>
        );
      })}
    </div>
  );
}
