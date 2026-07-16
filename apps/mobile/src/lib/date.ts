/**
 * Local-date helpers for the logging sheets. Uses local getters throughout so
 * the label matches the user's device day, not UTC.
 */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Thursday, July 16" — the date line under a sheet title. */
export function prettyToday(d: Date = new Date()): string {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "7:42 AM" — a journal entry's time label, device-local. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const twelve = h % 12 === 0 ? 12 : h % 12;
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${twelve}:${minutes} ${h < 12 ? "AM" : "PM"}`;
}
