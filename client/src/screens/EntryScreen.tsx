// EntryScreen — name-only entry (no login, no password).
// JSX moved verbatim from client/src/App.tsx; the only change is that
// navigation is a prop (onDemo) and the name submit is a prop (onEnterName).
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { FIELD_LIMITS } from "../../../server/src/planner-core";

export function EntryScreen({
  nameInput,
  setNameInput,
  onEnterName,
  onDemo,
}: {
  nameInput: string;
  setNameInput: (v: string) => void;
  onEnterName: () => void;
  onDemo: () => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-lg px-5 pb-10 pt-14">
        <p className="text-sm font-semibold tracking-wide text-accent2-strong">
          AEGIS • WEDDINGS • BIRTHDAYS • LARGE EVENTS
        </p>
        <h1 className="font-serif-display mt-3 text-5xl leading-tight">
          Aegis
          <br />
          Plan it. Budget it.
          <br />
          Audit it.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--dim)]">
          For events with 100s of guests, one wrong venue, food or budget call can ruin the day. Aegis walks you through
          the mandatory questions, builds a GenAI plan in INR (or a template fallback), recalculates every total in
          code, and flags problems before you commit.
        </p>
        <div className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <label htmlFor="planner-name" className="block text-base font-semibold">
            What should we call you?
          </label>
          <p className="mt-1 text-sm text-[var(--dim)]">No login, no password — just your name to get started.</p>
          <input
            id="planner-name"
            aria-label="Your name"
            maxLength={FIELD_LIMITS.plannerName}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEnterName();
            }}
            placeholder="e.g. Sept"
            className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-lg outline-none focus:border-[#0F4C4C]"
          />
          <button
            onClick={onEnterName}
            disabled={!nameInput.trim()}
            className="mt-4 w-full rounded-xl bg-[#0F4C4C] px-4 py-3.5 text-base font-semibold text-white disabled:opacity-40"
          >
            Continue
          </button>
        </div>
        <button
          onClick={() => onDemo()}
          className="mt-6 w-full rounded-xl border border-[var(--accent-strong)] px-4 py-3 text-sm font-semibold text-accent-strong"
        >
          📖 Demo guide, README & self-checks — see the 3-minute demo script
        </button>
        <p className="mt-6 text-center text-xs text-[var(--dim)]">
          Aegis • Milestone 5 — Contrast-safe themes (light & dark), polish, live self-checks, demo guide & README •
          Plan versions, compare & restore, printable summary • Full customise + 12-rule audit engine • GenAI
          gemini-3.5-flash-lite • Code recalculates every total • INR only
        </p>
      </main>
    </div>
  );
}
