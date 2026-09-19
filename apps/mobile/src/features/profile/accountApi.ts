/**
 * Account-level reads and writes — currently the data export.
 *
 * Types come from the tRPC router, not `@pulse/shared` (CLAUDE.md).
 */
import { trpc } from "../../lib/trpc";

export type ExportBundle = Awaited<ReturnType<typeof trpc.account.exportData.query>>;

/**
 * Every record BIOSYNC holds for this account.
 *
 * The photo links inside expire a few minutes after the export is built, which
 * is why the screen offers a refresh rather than caching this: a saved export
 * whose images 404 next week is worse than one the person re-makes.
 */
export async function exportData(): Promise<ExportBundle> {
  return trpc.account.exportData.query();
}

export type ExportSummaryRow = { label: string; count: number };

/**
 * What the export contains, as counts.
 *
 * Every row is listed whether or not it has anything in it — a zero is
 * information ("no meals logged"), while an omitted row reads as though the
 * export forgot that category. Somebody exercising a data right is entitled to
 * see that the thing they are looking for is genuinely absent rather than
 * missing.
 */
export function summariseExport(b: ExportBundle): ExportSummaryRow[] {
  return [
    { label: "Daily check-ins", count: b.dailyLogs.length },
    { label: "Metric readings", count: b.metrics.length },
    { label: "Readiness scores", count: b.readinessSnapshots.length },
    { label: "Meals", count: b.meals.length },
    { label: "Supplements", count: b.supplements.length },
    { label: "Supplement doses", count: b.supplementLogs.length },
    { label: "Goals", count: b.goals.length },
    { label: "Sharing settings", count: b.consents.length },
    { label: "Progress photos", count: b.photos.length },
    { label: "Reminders", count: b.notifications.nudges.length },
    { label: "Care connections", count: b.staff.links.length },
    { label: "Training plans", count: b.coaching.trainingPlans.length },
    { label: "Session notes", count: b.coaching.sessionNotes.length },
  ];
}
