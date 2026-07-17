/**
 * Data layer for the Insights feed. Kept apart from the screen so it stays
 * presentation-only. One call returns the streak (for the header pill) and the
 * ordered, server-generated insight cards, end-to-end typed via AppRouter.
 */
import { trpc } from "../../lib/trpc";
import { todayLocal } from "../checkin/checkinApi";

export type InsightsResponse = Awaited<ReturnType<typeof trpc.insights.list.query>>;
export type Insight = InsightsResponse["insights"][number];
export type InsightDelta = NonNullable<Insight["delta"]>;

export async function fetchInsights(): Promise<InsightsResponse> {
  return trpc.insights.list.query({ today: todayLocal() });
}
