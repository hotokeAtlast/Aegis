// SettingsScreen — Gemini API key / model settings.
// JSX moved verbatim from client/src/App.tsx; the settings query, the
// model-input sync effect and the save/clear mutations moved with it.
// Back navigation is a prop (onBack); the key/model inputs live in App so
// a half-typed key survives leaving and returning to Settings.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "../api";
import { FIELD_LIMITS, capText } from "../../../server/src/planner-core";

export function SettingsScreen({
  settingsKeyInput,
  setSettingsKeyInput,
  settingsModelInput,
  setSettingsModelInput,
  genCount,
  onBack,
}: {
  settingsKeyInput: string;
  setSettingsKeyInput: (v: string) => void;
  settingsModelInput: string;
  setSettingsModelInput: (v: string) => void;
  genCount: number;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings({}),
  });
  const settings = settingsQuery.data;
  useEffect(() => {
    if (settings?.model) setSettingsModelInput(settings.model);
  }, [settings?.model]);

  const saveSettingsMut = useMutation({
    mutationFn: () =>
      api.saveSettings({
        apiKey: settingsKeyInput ? capText(settingsKeyInput, FIELD_LIMITS.apiKey) : undefined,
        model: settingsModelInput ? capText(settingsModelInput, FIELD_LIMITS.modelName) : undefined,
      }),
    onSuccess: () => {
      setSettingsKeyInput("");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const clearKeyMut = useMutation({
    mutationFn: () => api.clearApiKey({}),
    onSuccess: () => {
      setSettingsKeyInput("");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-2xl px-5 pb-12 pt-6">
        <button
          onClick={() => onBack()}
          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium"
        >
          ← Back
        </button>
        <h1 className="font-serif-display mt-5 text-4xl">Aegis Settings — Gemini AI</h1>
        <p className="mt-2 text-[var(--dim)]">
          Aegis uses <strong>gemini-3.5-flash-lite</strong> only, temperature 0.3, JSON-only output, validated and
          recalculated in code. Your key is stored server-side for Aegis, never shown in full again, and never sent
          anywhere except Google Gemini when you generate.
        </p>

        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-semibold">Connection status</p>
          {settingsQuery.isPending ? (
            <p className="mt-2 text-[var(--dim)]">Checking…</p>
          ) : settings?.hasKey ? (
            <p className="mt-2 rounded-lg notice-success p-3 text-sm">
              ✓ Connected — key <strong>{settings.maskedKey}</strong> • Model <strong>{settings.model}</strong>
            </p>
          ) : (
            <p className="mt-2 rounded-lg notice-warning p-3 text-sm">
              <strong>Aegis AI generation not connected yet.</strong> No key saved. Generation will offer the template
              plan as fallback until you add a key.
            </p>
          )}
          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="gemini-model" className="font-semibold">
                Model name (configurable)
              </label>
              <input
                id="gemini-model"
                aria-label="Gemini model name"
                maxLength={FIELD_LIMITS.modelName}
                value={settingsModelInput}
                onChange={(e) => setSettingsModelInput(e.target.value)}
                placeholder="gemini-3.5-flash-lite"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
              />
              <p className="mt-1 text-xs text-[var(--dim)]">
                Default is gemini-3.5-flash-lite. Change only if Google renames the lite model.
              </p>
            </div>
            <div>
              <label htmlFor="gemini-key" className="font-semibold">
                Gemini API key
              </label>
              <input
                id="gemini-key"
                aria-label="Gemini API key"
                maxLength={FIELD_LIMITS.apiKey}
                type="password"
                autoComplete="off"
                value={settingsKeyInput}
                onChange={(e) => setSettingsKeyInput(e.target.value)}
                placeholder={
                  settings?.hasKey ? "Enter a new key to replace the saved one" : "Paste your Gemini API key"
                }
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3"
              />
              <p className="mt-1 text-xs text-[var(--dim)]">
                Get a key from Google AI Studio. It is saved on the server for Aegis only — the UI will only ever show a
                masked version afterwards.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => saveSettingsMut.mutate()}
                disabled={
                  saveSettingsMut.isPending || (!settingsKeyInput.trim() && settingsModelInput === settings?.model)
                }
                className="flex-1 rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                {saveSettingsMut.isPending ? "Saving…" : "Save settings"}
              </button>
              {settings?.hasKey ? (
                <button
                  onClick={() => clearKeyMut.mutate()}
                  disabled={clearKeyMut.isPending}
                  className="flex-1 rounded-xl border border-red-300 bg-white px-4 py-3 font-semibold text-red-700 disabled:opacity-50"
                >
                  Clear saved key
                </button>
              ) : null}
            </div>
            {saveSettingsMut.isSuccess ? (
              <p role="status" aria-live="polite" className="text-sm text-success-strong">
                Saved. Masked key: {settings?.maskedKey || "—"}
              </p>
            ) : null}
            {saveSettingsMut.isError ? (
              <p role="alert" className="text-sm text-danger-strong">
                {String((saveSettingsMut.error as Error)?.message || saveSettingsMut.error)}
              </p>
            ) : null}
            <p className="rounded-lg bg-[var(--surface-alt)] p-3 text-xs text-[var(--dim)]">
              Quota awareness: AI generations this session: <strong className="text-[var(--text)]">{genCount}</strong>.
              Aegis retries once on AI failure, then falls back to the template plan with a clear message — never a
              blank screen. Only wizard answers are sent to the model; your planner name is never sent.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
