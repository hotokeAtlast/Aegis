// actions.ts — build entry for the Aegis server actions.
//
// The actions themselves live in domain modules (actions-settings,
// actions-events, actions-versions, actions-checks); this file only
// aggregates them, so the action names, schemas and behaviour are
// unchanged. The client imports only the *type* of Actions from here
// (see client/src/api.ts), and the server build entry is this file.

import type { ActionsModule } from "@hatch/space-sdk";
import { settingsActions } from "./actions-settings";
import { eventActions } from "./actions-events";
import { versionActions } from "./actions-versions";
import { checkActions } from "./actions-checks";

export const Actions = {
  ...settingsActions,
  ...eventActions,
  ...versionActions,
  ...checkActions,
} satisfies ActionsModule;
