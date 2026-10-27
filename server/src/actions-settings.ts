// actions-settings.ts — Gemini Settings actions (get / save / clear).
// Moved verbatim from server/src/actions.ts.

import { defineAction, z } from "@hatch/space-sdk";
import { FIELD_LIMITS } from "./planner-core";
import { DEFAULT_MODEL, deleteSetting, getSetting, maskKey, setSetting } from "./settings-store";

export const settingsActions = {
  getSettings: defineAction({
    request: z.object({}),
    response: z.object({ hasKey: z.boolean(), maskedKey: z.string(), model: z.string(), defaultModel: z.string() }),
    async handler(ctx) {
      const key = await getSetting(ctx, "gemini_api_key");
      const model = (await getSetting(ctx, "gemini_model")) || DEFAULT_MODEL;
      return { hasKey: !!key, maskedKey: key ? maskKey(key) : "", model, defaultModel: DEFAULT_MODEL };
    },
  }),
  saveSettings: defineAction({
    request: z.object({
      apiKey: z.string().max(FIELD_LIMITS.apiKey).optional(),
      model: z.string().min(1).max(FIELD_LIMITS.modelName).optional(),
    }),
    response: z.object({ hasKey: z.boolean(), maskedKey: z.string(), model: z.string(), defaultModel: z.string() }),
    async handler(ctx, args) {
      if (args.apiKey !== undefined) {
        const trimmed = args.apiKey.trim();
        if (trimmed) await setSetting(ctx, "gemini_api_key", trimmed);
      }
      if (args.model) await setSetting(ctx, "gemini_model", args.model.trim());
      const key = await getSetting(ctx, "gemini_api_key");
      const model = (await getSetting(ctx, "gemini_model")) || DEFAULT_MODEL;
      ctx.invalidateQueries();
      return { hasKey: !!key, maskedKey: key ? maskKey(key) : "", model, defaultModel: DEFAULT_MODEL };
    },
  }),
  clearApiKey: defineAction({
    request: z.object({}),
    response: z.object({ hasKey: z.boolean(), maskedKey: z.string(), model: z.string(), defaultModel: z.string() }),
    async handler(ctx) {
      await deleteSetting(ctx, "gemini_api_key");
      const model = (await getSetting(ctx, "gemini_model")) || DEFAULT_MODEL;
      ctx.invalidateQueries();
      return { hasKey: false, maskedKey: "", model, defaultModel: DEFAULT_MODEL };
    },
  }),
};
