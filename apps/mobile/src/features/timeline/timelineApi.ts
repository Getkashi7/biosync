/**
 * Data layer for the Journal timeline. Fetches the trailing month of check-ins
 * and metric readings, then merges them into day groups keyed by device-local
 * date, newest first — check-in first within a day, then metrics newest-first,
 * matching the design.
 */
import { trpc } from "../../lib/trpc";
import { todayLocal } from "../checkin/checkinApi";
import { prettyToday } from "../../lib/date";

const WINDOW_DAYS = 30;

type Checkins = Awaited<ReturnType<typeof trpc.logs.range.query>>;
type Metrics = Awaited<ReturnType<typeof trpc.metrics.list.query>>;

export type CheckinEntry = Checkins[number];
export type MetricEntry = Metrics[number];

export type TimelineDay = {
  /** YYYY-MM-DD, device-local */
  date: string;
  /** "TODAY" / "YESTERDAY" / "MONDAY, JULY 13" */
  label: string;
  checkin: CheckinEntry | null;
  metrics: MetricEntry[];
};

function dayLabel(date: string, today: string, yesterday: string): string {
  if (date === today) return "TODAY";
  if (date === yesterday) return "YESTERDAY";
  // YYYY-MM-DD at local noon avoids DST edges shifting the calendar day.
  return prettyToday(new Date(`${date}T12:00:00`)).toUpperCase();
}

export async function fetchTimeline(): Promise<TimelineDay[]> {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - (WINDOW_DAYS - 1));

  const [checkins, metrics] = await Promise.all([
    trpc.logs.range.query({ from: todayLocal(from), to: todayLocal(now) }),
    trpc.metrics.list.query({
      from: new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      to: now.toISOString(),
    }),
  ]);

  const byDay = new Map<string, TimelineDay>();
  const today = todayLocal(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = todayLocal(yesterdayDate);

  const dayFor = (date: string): TimelineDay => {
    let day = byDay.get(date);
    if (!day) {
      day = { date, label: dayLabel(date, today, yesterday), checkin: null, metrics: [] };
      byDay.set(date, day);
    }
    return day;
  };

  for (const checkin of checkins) {
    dayFor(checkin.date).checkin = checkin;
  }
  // metrics.list is already newest-first, so per-day arrays stay sorted.
  for (const metric of metrics) {
    dayFor(todayLocal(new Date(metric.recordedAt))).metrics.push(metric);
  }

  return [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
