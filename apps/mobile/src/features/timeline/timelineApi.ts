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

export type TimelinePage = {
  days: TimelineDay[];
  /**
   * The day immediately before this page — pass it back as `endingAt` to fetch
   * the next window. Null once the page came back empty, which is how the UI
   * knows to stop offering "show earlier".
   */
  olderCursor: Date | null;
};

/**
 * One 30-day window of journal, ending at `endingAt` (default: today).
 *
 * The window used to be fixed at the trailing 30 days with no way past it, so a
 * long-term user's history simply stopped existing in the app. Paging backwards
 * keeps each request the same small size while making everything reachable.
 */
export async function fetchTimelinePage(endingAt: Date = new Date()): Promise<TimelinePage> {
  const now = endingAt;
  const from = new Date(now);
  from.setDate(from.getDate() - (WINDOW_DAYS - 1));

  const [checkins, metrics] = await Promise.all([
    trpc.logs.range.query({ from: todayLocal(from), to: todayLocal(now) }),
    trpc.metrics.list.query({
      from: new Date(new Date(from).setHours(0, 0, 0, 0)).toISOString(),
      to: new Date(new Date(now).setHours(23, 59, 59, 999)).toISOString(),
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

  const days = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  // An empty window means we've paged past the start of their history. Anything
  // else keeps the door open — a quiet month is not the end of the record.
  const older = new Date(from);
  older.setDate(older.getDate() - 1);
  return { days, olderCursor: days.length === 0 ? null : older };
}

/** The most recent window. Kept for callers that only ever want "recent". */
export async function fetchTimeline(): Promise<TimelineDay[]> {
  return (await fetchTimelinePage()).days;
}
