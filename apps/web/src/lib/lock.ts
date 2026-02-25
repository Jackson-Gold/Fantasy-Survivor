/**
 * Approximate next Wednesday 8:00 PM America/New_York for display.
 * For strict enforcement the backend uses server time.
 */
export function getNextLockTime(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const weekdays: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const day = weekdays[weekday ?? ''] ?? 0;
  let daysUntilWed = (3 - day + 7) % 7;
  if (daysUntilWed === 0 && (get('hour') > 20 || (get('hour') === 20 && get('minute') >= 0))) {
    daysUntilWed = 7;
  }
  const d = new Date(now);
  d.setDate(d.getDate() + daysUntilWed);
  d.setHours(20, 0, 0, 0);
  return d;
}
