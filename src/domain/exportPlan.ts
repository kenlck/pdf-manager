import type { ExportPage, Session } from "./types";

export type ExportPlanResult =
  | { ok: true; pages: ExportPage[] }
  | { ok: false; reason: "empty" };

export function buildExportPlan(session: Session): ExportPlanResult {
  if (session.pages.length === 0) {
    return { ok: false, reason: "empty" };
  }
  return {
    ok: true,
    pages: session.pages.map((page) => ({
      sourceId: page.sourceId,
      pageIndex: page.pageIndex,
      rotation: page.rotation,
    })),
  };
}
