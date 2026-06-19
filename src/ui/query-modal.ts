import type { EnterpriseFlowPlugin } from "../main";
import type { WikiId } from "@shared/types/wiki-instance";
import { openQueryView } from "./query-view";

/** @deprecated Use openQueryView for the full query panel. */
export function openQueryModal(
  plugin: EnterpriseFlowPlugin,
  wikiId: WikiId,
): void {
  void openQueryView(plugin, wikiId);
}
