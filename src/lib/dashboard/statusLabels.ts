// src/lib/dashboard/statusLabels.ts
// Humanized text labels for the two status-like enums in the schema.
// Status is always conveyed by this text, never by color alone — every
// StatusPill renders one of these labels next to its dot.
import type { z } from "zod";
import type { Stage as StageSchema, WorkStatus as WorkStatusSchema } from "../schema.ts";

export type WorkStatusValue = z.infer<typeof WorkStatusSchema>;
export type StageValue = z.infer<typeof StageSchema>;
export type PillStatus = WorkStatusValue | StageValue;

export const WORK_STATUS_LABELS: Record<WorkStatusValue, string> = {
  shipped: "Shipped",
  staged: "Staged",
  in_review: "In review",
  in_progress: "In progress",
  blocked: "Blocked",
  todo: "To do",
};

export const STAGE_LABELS: Record<StageValue, string> = {
  not_started: "Not started",
  early: "Early",
  underway: "Underway",
  nearly_done: "Nearly done",
  done: "Done",
};

export function statusLabel(status: PillStatus): string {
  return (WORK_STATUS_LABELS as Record<string, string>)[status] ?? (STAGE_LABELS as Record<string, string>)[status] ?? status;
}
