/**
 * Data layer for the Home dashboard. Kept apart from the screen so it stays
 * presentation-only. One call fetches everything the dashboard renders:
 * today's readiness (score + component breakdown) and the check-in streak.
 */
import { trpc } from "../../lib/trpc";
import { todayLocal } from "../checkin/checkinApi";

/** Server-computed readiness, end-to-end typed via AppRouter. */
export type ReadinessToday = Awaited<ReturnType<typeof trpc.readiness.today.query>>;

export type DashboardData = {
  readiness: ReadinessToday;
  streak: number;
};

export async function fetchDashboard(): Promise<DashboardData> {
  const today = todayLocal();
  const [readiness, streakResult] = await Promise.all([
    trpc.readiness.today.query({ today }),
    trpc.logs.streak.query({ today }),
  ]);
  return { readiness, streak: streakResult.streak };
}
