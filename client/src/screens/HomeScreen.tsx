// HomeScreen — greeting, settings/demo shortcuts, event list.
// JSX moved verbatim from client/src/App.tsx. The events and settings
// queries moved with it (the old `enabled: screen === "home"` gate is
// equivalent: this component only mounts on the home screen). All
// navigation is props.
import { useQuery } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "../api";
import { formatINR, formatNum } from "../../../server/src/planner-core";

export function HomeScreen({
  plannerName,
  genCount,
  onSettings,
  onDemo,
  onStartWizard,
  onOpenEvent,
  onUseDifferentName,
}: {
  plannerName: string;
  genCount: number;
  onSettings: () => void;
  onDemo: () => void;
  onStartWizard: () => void;
  onOpenEvent: (eventId: number) => void;
  onUseDifferentName: () => void;
}) {
  const eventsQuery = useQuery({
    queryKey: ["events", plannerName],
    queryFn: () => api.listEvents({ plannerName: plannerName || undefined }),
    enabled: !!plannerName,
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings({}),
  });
  const settings = settingsQuery.data;
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-3xl px-5 pb-10 pt-8">
        <p className="text-sm text-[var(--dim)]">Welcome back to Aegis</p>
        <h1 className="font-serif-display mt-1 text-4xl">Hello, {plannerName} 👋</h1>
        <p className="mt-3 text-[var(--dim)]">
          Ready to plan an event with Aegis that stays inside budget and fits every guest?
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              onSettings();
            }}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold"
          >
            ⚙️ Settings / API Key
          </button>
          <button
            onClick={() => onDemo()}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold"
          >
            📖 Demo guide & README
          </button>
          <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-xs">
            AI generations this session: <strong>{genCount}</strong>
          </span>
        </div>
        {settings && !settings.hasKey ? (
          <div className="mt-4 rounded-xl border notice-warning p-4 text-sm">
            <strong>Aegis AI generation not connected yet.</strong> No Gemini API key is saved. You can still use the
            template plan as fallback, or add your key now.{" "}
            <button
              onClick={() => {
                onSettings();
              }}
              className="ml-1 font-bold underline"
            >
              Go to Settings →
            </button>
          </div>
        ) : settings?.hasKey ? (
          <div className="mt-4 rounded-xl border notice-success p-4 text-sm">
            ✓ <strong>AI connected</strong> — model <strong>{settings.model}</strong> • Key {settings.maskedKey}
          </div>
        ) : null}
        <button
          onClick={() => {
            onStartWizard();
          }}
          className="mt-6 w-full rounded-2xl bg-[#B45309] px-5 py-4 text-left text-white shadow-sm sm:w-auto"
        >
          <span className="block text-lg font-bold">+ Start a new event</span>
          <span className="block text-sm opacity-90">Answer 6 mandatory steps, then get your Aegis template plan</span>
        </button>

        <h2 className="mt-10 text-lg font-bold">Your events in Aegis</h2>
        {eventsQuery.isPending ? <p className="mt-3 text-[var(--dim)]">Loading your events…</p> : null}
        {eventsQuery.data && eventsQuery.data.events.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[var(--dim)]">
            No events yet. Start your first event above — try the demo: 300 guests, Hyderabad, ₹12,00,000 to ₹20,00,000.
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          {eventsQuery.data?.events.map((evItem) => (
            <button
              key={evItem.id}
              onClick={() => {
                onOpenEvent(evItem.id);
              }}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{evItem.title}</p>
                  <p className="text-sm capitalize text-[var(--dim)]">
                    {evItem.eventType} • {evItem.city} • {evItem.eventDate}
                  </p>
                  <p className="mt-1 text-sm">
                    {formatNum(evItem.guestCount)} guests • Budget {formatINR(evItem.budgetMinInr)} –{" "}
                    {formatINR(evItem.budgetMaxInr)}
                  </p>
                </div>
                <span className="rounded-full bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#92400E]">
                  View plan →
                </span>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            onUseDifferentName();
          }}
          className="mt-8 text-sm text-[var(--dim)] underline"
        >
          Use a different name
        </button>
      </main>
    </div>
  );
}
