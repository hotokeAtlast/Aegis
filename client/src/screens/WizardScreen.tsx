// WizardScreen — the 7-step mandatory wizard plus review & generate.
// JSX moved verbatim from client/src/App.tsx. The wizard state itself
// lives in App (so going to Settings from Review and back preserves it);
// this screen owns the payload normalisation, the template/AI create
// mutations and step navigation. Validation is the pure validateWizardStep
// from wizard.ts, applied to the wizard state passed in as props.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "../api";
import { FIELD_LIMITS, capText, formatINR, formatNum, plannedGuestsFor } from "../../../server/src/planner-core";
import { ENTERTAINMENT_OPTS, defaultManpower, validateWizardStep, type WizardState } from "../wizard";

export function WizardScreen({
  wiz,
  setWiz,
  wizardStep,
  setWizardStep,
  wizardError,
  setWizardError,
  plannerName,
  genCount,
  genMessage,
  onCreated,
  onAiMessage,
  onBumpGenCount,
  onCancel,
  onSettings,
}: {
  wiz: WizardState;
  setWiz: (v: WizardState) => void;
  wizardStep: number;
  setWizardStep: (v: number) => void;
  wizardError: string;
  setWizardError: (v: string) => void;
  plannerName: string;
  genCount: number;
  genMessage: string;
  onCreated: (eventId: number) => void;
  onAiMessage: (message: string) => void;
  onBumpGenCount: () => void;
  onCancel: () => void;
  onSettings: () => void;
}) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings({}),
  });
  const settings = settingsQuery.data;
  // Normalise before sending (422 fix): number inputs can hold decimals or
  // NaN (a cleared field), which JSON turns into null and a strict server
  // schema rejected with an opaque "failed: 422" before the plan fallback
  // could run. Round every count/amount to a whole number, guard NaN, trim
  // text, and cap text at the lengths the inputs allow.
  function whole(v: number, fallback = 0): number {
    return Number.isFinite(v) ? Math.round(v) : fallback;
  }
  function wizardPayload() {
    const manpower = wiz.manpower
      .filter((m) => m.selected)
      .map((m) => ({
        role: capText(m.role, FIELD_LIMITS.manpowerRole),
        label: capText(m.label, FIELD_LIMITS.manpowerLabel),
        count: whole(m.count),
        costPerPersonInr: whole(m.costPerPersonInr),
      }));
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
      onCreated(data.event.id);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
  const createAIMut = useMutation({
    mutationFn: () => api.createEventAI(wizardPayload()),
    onSuccess: (data) => {
      onBumpGenCount();
      onAiMessage(data.message);
      onCreated(data.event.id);
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => {
      // Never leave the user on a raw "failed: 422": explain in plain words
      // and fall back to the template plan automatically, so they still get
      // a full plan and can Regenerate with AI from the plan screen.
      const detail = String((e as Error)?.message || e);
      onAiMessage(
        `Generate with AI could not start (${detail}). Creating your plan with the template instead so you are not stuck — once it opens, use Regenerate with AI on the plan screen to try AI again.`,
      );
      if (!createMut.isPending && !createMut.isSuccess) createMut.mutate();
    },
  });
  function nextStep() {
    const err = validateWizardStep(wizardStep, wiz, plannerName);
    if (err) {
      setWizardError(err);
      return;
    }
    setWizardError("");
    if (wizardStep < 6) setWizardStep(wizardStep + 1);
  }

  // Generate buttons validate ALL steps (not just the last one) and jump to
  // the first step that needs attention, with the reason shown.
  function validateAllSteps(): boolean {
    for (let s = 0; s <= 5; s++) {
      const err = validateWizardStep(s, wiz, plannerName);
      if (err) {
        setWizardStep(s);
        setWizardError(err);
        return false;
      }
    }
    setWizardError("");
    return true;
  }

  const perGuestMin = wiz.guestCount ? Math.round(wiz.budgetMinInr / wiz.guestCount) : 0;
  const perGuestMax = wiz.guestCount ? Math.round(wiz.budgetMaxInr / wiz.guestCount) : 0;
  const stepsLabels = ["Event", "Budget", "Venue", "Food", "Entertainment", "People", "Review"];
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-2xl px-5 pb-12 pt-6">
        <div className="flex items-center justify-between">
          <button
            aria-label="Back to home"
            onClick={() => (wizardStep === 0 ? onCancel() : (setWizardStep(wizardStep - 1), setWizardError("")))}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium"
          >
            ← Back
          </button>
          <span className="text-sm font-medium text-[var(--dim)]">
            Aegis • Step {wizardStep + 1} of 7 — {stepsLabels[wizardStep]}
          </span>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--border)]"
          role="progressbar"
          aria-valuenow={wizardStep + 1}
          aria-valuemin={1}
          aria-valuemax={7}
        >
          <div className="h-full bg-[#0F4C4C] transition-all" style={{ width: `${((wizardStep + 1) / 7) * 100}%` }} />
        </div>
        <ol aria-label="Wizard steps" className="mt-3 flex flex-wrap gap-1.5 list-none">
          {stepsLabels.map((l, i) => (
            <li
              key={l}
              aria-current={i === wizardStep ? "step" : undefined}
              className={`rounded-full px-2.5 py-1 text-xs ${i === wizardStep ? "bg-[#0F4C4C] font-semibold text-white" : i < wizardStep ? "notice-success" : "bg-[var(--surface)] text-[var(--dim)] border border-[var(--border)]"}`}
            >
              {l}
            </li>
          ))}
        </ol>

        {wizardError ? (
          <div
            id="wizard-error"
            role="alert"
            aria-live="assertive"
            className="mt-4 rounded-xl border notice-danger p-3 text-sm font-medium"
          >
            {wizardError}
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
          {wizardStep === 0 && (
            <div className="space-y-5">
              <h2 className="font-serif-display text-3xl">Event basics</h2>
              <div>
                <label htmlFor="event-type" className="font-semibold">
                  Event type *
                </label>
                <select
                  id="event-type"
                  value={wiz.eventType}
                  onChange={(e) => setWiz({ ...wiz, eventType: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                >
                  <option value="wedding">Wedding</option>
                  <option value="birthday">Birthday</option>
                  <option value="corporate">Corporate</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="event-title" className="font-semibold">
                  Event title *
                </label>
                <input
                  id="event-title"
                  aria-describedby={wizardError ? "wizard-error" : undefined}
                  aria-invalid={!!wizardError}
                  maxLength={FIELD_LIMITS.title}
                  value={wiz.title}
                  onChange={(e) => setWiz({ ...wiz, title: e.target.value })}
                  placeholder="e.g. Aisha & Rohan Wedding"
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="event-date" className="font-semibold">
                    Date *
                  </label>
                  <input
                    id="event-date"
                    type="date"
                    value={wiz.eventDate}
                    onChange={(e) => setWiz({ ...wiz, eventDate: e.target.value })}
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                  />
                </div>
                <div>
                  <label htmlFor="event-city" className="font-semibold">
                    City *
                  </label>
                  <input
                    id="event-city"
                    aria-describedby={wizardError ? "wizard-error" : undefined}
                    aria-invalid={!!wizardError}
                    maxLength={FIELD_LIMITS.city}
                    value={wiz.city}
                    onChange={(e) => setWiz({ ...wiz, city: e.target.value })}
                    placeholder="e.g. Hyderabad"
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="guest-count" className="font-semibold">
                  Expected guests * (10 to 2,000)
                </label>
                <input
                  id="guest-count"
                  aria-describedby={wizardError ? "wizard-error" : undefined}
                  type="number"
                  min={10}
                  max={2000}
                  value={wiz.guestCount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setWiz({ ...wiz, guestCount: v, manpower: defaultManpower(v || 300) });
                  }}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg"
                />
                <p className="mt-2 text-sm text-[var(--dim)]">
                  With 10% buffer, we will plan food for{" "}
                  <strong className="text-[var(--text)]">
                    {formatNum(plannedGuestsFor(wiz.guestCount || 0))} guests
                  </strong>
                  .
                </p>
              </div>
            </div>
          )}

          {wizardStep === 1 && (
            <div className="space-y-5">
              <h2 className="font-serif-display text-3xl">Budget in INR</h2>
              <p className="text-[var(--dim)]">
                Set your lower and upper limits. The Aegis template plan will target the midpoint and stay inside this
                band.
              </p>
              <div>
                <label htmlFor="budget-min" className="font-semibold">
                  Minimum budget (₹) *
                </label>
                <input
                  id="budget-min"
                  aria-describedby={wizardError ? "wizard-error" : undefined}
                  type="number"
                  min={0}
                  step={1000}
                  value={wiz.budgetMinInr}
                  onChange={(e) => setWiz({ ...wiz, budgetMinInr: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg"
                />
                <p className="mt-1 text-sm text-[var(--dim)]">{formatINR(wiz.budgetMinInr || 0)}</p>
              </div>
              <div>
                <label htmlFor="budget-max" className="font-semibold">
                  Maximum budget (₹) *
                </label>
                <input
                  id="budget-max"
                  aria-describedby={wizardError ? "wizard-error" : undefined}
                  type="number"
                  min={0}
                  step={1000}
                  value={wiz.budgetMaxInr}
                  onChange={(e) => setWiz({ ...wiz, budgetMaxInr: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg"
                />
                <p className="mt-1 text-sm text-[var(--dim)]">{formatINR(wiz.budgetMaxInr || 0)}</p>
              </div>
              <div className="rounded-xl highlight-box p-4">
                <p className="text-sm font-semibold">Live per-guest range</p>
                <p className="font-serif-display mt-1 text-3xl">
                  {formatINR(perGuestMin)} – {formatINR(perGuestMax)}{" "}
                  <span className="text-base font-sans highlight-sub">per guest</span>
                </p>
                <p className="mt-1 text-sm highlight-sub">
                  Midpoint budget: {formatINR(Math.floor(((wiz.budgetMinInr || 0) + (wiz.budgetMaxInr || 0)) / 2))} for{" "}
                  {formatNum(wiz.guestCount)} guests
                </p>
                {perGuestMax > 0 && perGuestMax < 1500 ? (
                  <p className="mt-2 text-sm font-medium text-warning-strong">
                    ⚠ Per-guest max is below ₹1,500 — very tight for a large event. Food alone may break this.
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-5">
              <h2 className="font-serif-display text-3xl">Venue needs</h2>
              <div>
                <span className="font-semibold">Venue type *</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {["indoor", "outdoor", "either"].map((v) => (
                    <button
                      key={v}
                      onClick={() => setWiz({ ...wiz, venuePref: v })}
                      aria-pressed={wiz.venuePref === v}
                      aria-label={`Venue ${v}`}
                      className={`rounded-xl border px-3 py-3 capitalize ${wiz.venuePref === v ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : "border-[var(--border)] bg-[var(--bg)]"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
                <div>
                  <p className="font-semibold">Huge parking needed?</p>
                  <p className="text-sm text-[var(--dim)]">For guests arriving by car</p>
                </div>
                <button
                  role="switch"
                  aria-checked={wiz.needsParking}
                  aria-label="Huge parking"
                  onClick={() => setWiz({ ...wiz, needsParking: !wiz.needsParking })}
                  className={`h-8 w-14 rounded-full p-1 ${wiz.needsParking ? "bg-[#0F4C4C]" : "bg-gray-300"}`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white transition ${wiz.needsParking ? "translate-x-6" : ""}`}
                  />
                </button>
              </div>
              {wiz.needsParking ? (
                <div>
                  <label htmlFor="expected-cars" className="font-semibold">
                    Expected cars *
                  </label>
                  <input
                    id="expected-cars"
                    type="number"
                    min={0}
                    value={wiz.expectedCars}
                    onChange={(e) => setWiz({ ...wiz, expectedCars: Number(e.target.value) })}
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                  />
                  <p className="mt-1 text-sm text-[var(--dim)]">
                    Rule of thumb: 1 car per 4 guests ≈ {Math.ceil((wiz.guestCount || 0) / 4)} cars
                  </p>
                </div>
              ) : null}
              <div>
                <label htmlFor="area-pref" className="font-semibold">
                  Area preference (optional)
                </label>
                <input
                  id="area-pref"
                  aria-describedby={wizardError ? "wizard-error" : undefined}
                  maxLength={FIELD_LIMITS.areaPreference}
                  value={wiz.areaPreference}
                  onChange={(e) => setWiz({ ...wiz, areaPreference: e.target.value })}
                  placeholder="e.g. Near airport, city centre"
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                />
              </div>
              <p className="rounded-xl bg-[var(--surface-alt)] p-3 text-sm">
                Capacity needed: <strong>{formatNum(plannedGuestsFor(wiz.guestCount))}</strong> (guests + 10% buffer)
              </p>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-5">
              <h2 className="font-serif-display text-3xl">Food</h2>
              <div>
                <span className="font-semibold">Food type *</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {["veg", "non-veg", "mixed"].map((v) => (
                    <button
                      key={v}
                      onClick={() =>
                        setWiz({
                          ...wiz,
                          foodType: v,
                          vegPercent:
                            v === "veg"
                              ? 100
                              : v === "non-veg"
                                ? 0
                                : wiz.vegPercent === 100 || wiz.vegPercent === 0
                                  ? 60
                                  : wiz.vegPercent,
                        })
                      }
                      aria-pressed={wiz.foodType === v}
                      aria-label={`Food ${v}`}
                      className={`rounded-xl border px-3 py-3 capitalize ${wiz.foodType === v ? "border-[#0F4C4C] bg-[#0F4C4C] text-white" : "border-[var(--border)] bg-[var(--bg)]"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {wiz.foodType === "mixed" && (
                <div className="rounded-xl border border-[var(--border)] p-4">
                  <label htmlFor="veg-percent" className="font-semibold">
                    Veg % — must total 100% with non-veg
                  </label>
                  <input
                    id="veg-percent"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={wiz.vegPercent}
                    onChange={(e) => setWiz({ ...wiz, vegPercent: Number(e.target.value) })}
                    className="mt-3 w-full"
                  />
                  <div className="mt-2 flex justify-between text-sm">
                    <span>
                      Veg: <strong>{wiz.vegPercent}%</strong> (
                      {formatNum(Math.ceil((plannedGuestsFor(wiz.guestCount) * wiz.vegPercent) / 100))} plates)
                    </span>
                    <span>
                      Non-veg: <strong>{100 - wiz.vegPercent}%</strong> (
                      {formatNum(Math.ceil((plannedGuestsFor(wiz.guestCount) * (100 - wiz.vegPercent)) / 100))} plates)
                    </span>
                  </div>
                </div>
              )}
              {[
                { key: "desserts" as const, label: "Desserts", desc: "Adds ₹150 / plate in template" },
                { key: "fruits" as const, label: "Fruits", desc: "Adds ₹80 / plate in template" },
                { key: "dryFruits" as const, label: "Dry Fruits", desc: "Adds ₹120 / plate in template" },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4"
                >
                  <div>
                    <p className="font-semibold">{item.label}</p>
                    <p className="text-sm text-[var(--dim)]">{item.desc}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={wiz[item.key]}
                    aria-label={item.label}
                    onClick={() => setWiz({ ...wiz, [item.key]: !wiz[item.key] })}
                    className={`h-8 w-14 shrink-0 rounded-full p-1 ${wiz[item.key] ? "bg-[#0F4C4C]" : "bg-gray-300"}`}
                  >
                    <span
                      className={`block h-6 w-6 rounded-full bg-white transition ${wiz[item.key] ? "translate-x-6" : ""}`}
                    />
                  </button>
                </div>
              ))}
              <div>
                <label htmlFor="dietary" className="font-semibold">
                  Dietary restrictions / allergies (optional)
                </label>
                <textarea
                  id="dietary"
                  aria-describedby={wizardError ? "wizard-error" : undefined}
                  maxLength={FIELD_LIMITS.dietaryNotes}
                  value={wiz.dietaryNotes}
                  onChange={(e) => setWiz({ ...wiz, dietaryNotes: e.target.value })}
                  placeholder="e.g. Jain options, nut allergy, no onion-garlic for 20 guests"
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                  rows={3}
                />
              </div>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="space-y-5">
              <h2 className="font-serif-display text-3xl">Entertainment</h2>
              <div>
                <span className="font-semibold">Entertainment types * (pick at least one)</span>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {ENTERTAINMENT_OPTS.map((opt) => {
                    const on = wiz.entertainmentTypes.includes(opt);
                    return (
                      <button
                        key={opt}
                        aria-label={opt}
                        aria-pressed={on}
                        onClick={() =>
                          setWiz({
                            ...wiz,
                            entertainmentTypes: on
                              ? wiz.entertainmentTypes.filter((x) => x !== opt)
                              : [...wiz.entertainmentTypes, opt],
                          })
                        }
                        className={`rounded-xl border px-3 py-3 text-left text-sm ${on ? "border-[#0F4C4C] notice-success font-semibold" : "border-[var(--border)] bg-[var(--bg)]"}`}
                      >
                        {on ? "✓ " : ""}
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label htmlFor="ent-hours" className="font-semibold">
                  Duration (hours) *
                </label>
                <input
                  id="ent-hours"
                  type="number"
                  min={1}
                  max={12}
                  value={wiz.entertainmentHours}
                  onChange={(e) => setWiz({ ...wiz, entertainmentHours: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
                <div>
                  <p className="font-semibold">Kids activities?</p>
                  <p className="text-sm text-[var(--dim)]">Games, kids zone, entertainer</p>
                </div>
                <button
                  role="switch"
                  aria-checked={wiz.kidsActivities}
                  aria-label="Kids activities"
                  onClick={() => setWiz({ ...wiz, kidsActivities: !wiz.kidsActivities })}
                  className={`h-8 w-14 rounded-full p-1 ${wiz.kidsActivities ? "bg-[#0F4C4C]" : "bg-gray-300"}`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white transition ${wiz.kidsActivities ? "translate-x-6" : ""}`}
                  />
                </button>
              </div>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="space-y-5">
              <h2 className="font-serif-display text-3xl">People & resources</h2>
              <p className="text-sm text-[var(--dim)]">
                Suggested: 1 server per 20 guests = {Math.ceil(wiz.guestCount / 20)} servers for {wiz.guestCount}{" "}
                guests.
              </p>
              <div className="space-y-3">
                {wiz.manpower.map((m, idx) => (
                  <div key={m.role} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3">
                    <input
                      type="checkbox"
                      id={`mp-${m.role}`}
                      aria-label={m.label}
                      checked={m.selected}
                      onChange={(e) => {
                        const copy = [...wiz.manpower];
                        copy[idx] = { ...m, selected: e.target.checked };
                        setWiz({ ...wiz, manpower: copy });
                      }}
                      className="h-5 w-5"
                    />
                    <label htmlFor={`mp-${m.role}`} className="flex-1 font-medium">
                      {m.label}
                      <span className="block text-xs font-normal text-[var(--dim)]">
                        {formatINR(m.costPerPersonInr)} per person
                      </span>
                    </label>
                    <label className="sr-only" htmlFor={`mp-count-${m.role}`}>
                      {m.label} count
                    </label>
                    <input
                      id={`mp-count-${m.role}`}
                      type="number"
                      min={0}
                      value={m.count}
                      onChange={(e) => {
                        const copy = [...wiz.manpower];
                        copy[idx] = { ...m, count: Number(e.target.value) };
                        setWiz({ ...wiz, manpower: copy });
                      }}
                      className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-center"
                    />
                    <span className="hidden w-24 text-right text-sm text-[var(--dim)] sm:block">
                      {formatINR(m.count * m.costPerPersonInr)}
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <label htmlFor="decor-level" className="font-semibold">
                  Decor level *
                </label>
                <select
                  id="decor-level"
                  value={wiz.decorLevel}
                  onChange={(e) => setWiz({ ...wiz, decorLevel: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
                >
                  <option value="simple">Simple</option>
                  <option value="premium">Premium</option>
                  <option value="luxury">Luxury</option>
                </select>
              </div>
              <p className="rounded-xl bg-[var(--surface-alt)] p-3 text-sm">
                Manpower total (selected):{" "}
                <strong>
                  {formatINR(
                    wiz.manpower.filter((m) => m.selected).reduce((s, m) => s + m.count * m.costPerPersonInr, 0),
                  )}
                </strong>
              </p>
            </div>
          )}

          {wizardStep === 6 && (
            <div className="space-y-4">
              <h2 className="font-serif-display text-3xl">Review & generate</h2>
              <p className="text-[var(--dim)]">
                Check everything. Aegis Generate with AI uses gemini-3.5-flash-lite (temperature 0.3), validates JSON,
                then recalculates every total in code. Template is always available as fallback.
              </p>
              {settings && !settings.hasKey ? (
                <div className="rounded-xl border notice-warning p-3 text-sm">
                  <strong>AI not connected yet:</strong> no key saved — Generate with AI will fall back to template with
                  an explanation.{" "}
                  <button
                    onClick={() => {
                      onSettings();
                    }}
                    className="font-bold underline"
                  >
                    Add key in Settings →
                  </button>
                </div>
              ) : (
                <div className="rounded-xl notice-success p-3 text-sm">
                  AI ready — {settings?.model} • Generations this session: {genCount}
                </div>
              )}
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-[var(--border)] py-2">
                  <dt className="text-[var(--dim)]">Planner</dt>
                  <dd className="font-medium">{plannerName}</dd>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] py-2">
                  <dt className="text-[var(--dim)]">Event</dt>
                  <dd className="font-medium capitalize">
                    {wiz.eventType} — {wiz.title}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] py-2">
                  <dt className="text-[var(--dim)]">Date / City</dt>
                  <dd className="font-medium">
                    {wiz.eventDate} • {wiz.city}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] py-2">
                  <dt className="text-[var(--dim)]">Guests</dt>
                  <dd className="font-medium">
                    {formatNum(wiz.guestCount)} (+10% = {formatNum(plannedGuestsFor(wiz.guestCount))} for food)
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] py-2">
                  <dt className="text-[var(--dim)]">Budget</dt>
                  <dd className="font-medium">
                    {formatINR(wiz.budgetMinInr)} – {formatINR(wiz.budgetMaxInr)}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] py-2">
                  <dt className="text-[var(--dim)]">Per guest</dt>
                  <dd className="font-medium">
                    {formatINR(perGuestMin)} – {formatINR(perGuestMax)}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] py-2">
                  <dt className="text-[var(--dim)]">Venue</dt>
                  <dd className="font-medium capitalize">
                    {wiz.venuePref}
                    {wiz.needsParking ? ` • Parking for ${wiz.expectedCars} cars` : " • No parking"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] py-2">
                  <dt className="text-[var(--dim)]">Food</dt>
                  <dd className="font-medium capitalize">
                    {wiz.foodType}
                    {wiz.foodType === "mixed" ? ` (${wiz.vegPercent}% veg)` : ""} • Desserts{" "}
                    {wiz.desserts ? "Yes" : "No"} • Fruits {wiz.fruits ? "Yes" : "No"} • Dry fruits{" "}
                    {wiz.dryFruits ? "Yes" : "No"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] py-2">
                  <dt className="text-[var(--dim)]">Entertainment</dt>
                  <dd className="font-medium">
                    {wiz.entertainmentTypes.join(", ")} • {wiz.entertainmentHours}h • Kids{" "}
                    {wiz.kidsActivities ? "Yes" : "No"}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-[var(--dim)]">Decor</dt>
                  <dd className="font-medium capitalize">{wiz.decorLevel}</dd>
                </div>
              </dl>
              <div className="rounded-xl notice-success p-4 text-sm">
                <p className="font-semibold">
                  Template fallback split (of midpoint{" "}
                  {formatINR(Math.floor((wiz.budgetMinInr + wiz.budgetMaxInr) / 2))})
                </p>
                <p className="mt-1">
                  Venue 30% • Food 35% • Decor 15% • Entertainment 8% • Photography 5% • Manpower 5% • Misc 2%
                </p>
              </div>
              {createMut.isError ? (
                <p role="alert" className="rounded-xl notice-danger p-3 text-sm">
                  {String((createMut.error as Error)?.message || createMut.error)}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          {wizardStep > 0 ? (
            <button
              onClick={() => {
                setWizardStep(wizardStep - 1);
                setWizardError("");
              }}
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 font-semibold"
            >
              Back
            </button>
          ) : (
            <button
              onClick={() => onCancel()}
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 font-semibold"
            >
              Cancel
            </button>
          )}
          {wizardStep < 6 ? (
            <button
              onClick={nextStep}
              className="flex-[2] rounded-xl bg-[#0F4C4C] px-4 py-3.5 font-semibold text-white"
            >
              Continue →
            </button>
          ) : (
            <div className="flex flex-[2] flex-col gap-2">
              <button
                onClick={() => {
                  if (!validateAllSteps()) return;
                  createAIMut.mutate();
                }}
                disabled={createAIMut.isPending || createMut.isPending}
                className="w-full rounded-xl bg-[#0F4C4C] px-4 py-3.5 font-semibold text-white disabled:opacity-50"
              >
                {createAIMut.isPending
                  ? "Generating AI plan with Gemini… (retrying once on failure)"
                  : createMut.isPending
                    ? "AI could not start — creating template plan instead…"
                    : "✨ Generate with AI"}
              </button>
              <button
                onClick={() => {
                  if (!validateAllSteps()) return;
                  createMut.mutate();
                }}
                disabled={createMut.isPending || createAIMut.isPending}
                className="w-full rounded-xl border border-[#B45309] bg-white px-4 py-3 font-semibold text-[#92400E] disabled:opacity-50"
              >
                {createMut.isPending ? "Generating template…" : "Use template plan (fallback)"}
              </button>
              {genMessage ? (
                <p role="status" className="rounded-xl notice-info p-3 text-sm">
                  {genMessage}
                </p>
              ) : null}
              {createMut.isError && !createAIMut.isPending ? (
                <p role="alert" className="rounded-xl notice-danger p-3 text-sm">
                  The Aegis template fallback could not be created either:{" "}
                  {String((createMut.error as Error)?.message || createMut.error)} — check the highlighted step above
                  and try again.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
