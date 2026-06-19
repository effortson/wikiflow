import type { WikiFlowPlugin } from "../main";
import type { WikiId } from "@shared/types/wiki-instance";
import { openQueryView } from "./query-view";

/** @deprecated Use openQueryView for the full query panel. */
export function openQueryModal(
  plugin: WikiFlowPlugin,
  wikiId: WikiId,
): void {
  void openQueryView(plugin, wikiId);
}
