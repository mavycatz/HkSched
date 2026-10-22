/**
 * The school runs on Manila time, so every date the staff member types is
 * read as a Manila wall clock and stored as a timestamp.
 */

/**
 * A "YYYY-MM-DDTHH:mm" value as the database stores it: the Manila wall clock
 * with its offset. Anything else is left to `Date`.
 */
export function manilaTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}T${match[2]}:${match[3] || "00"}+08:00`;
}

/** The moment a form value names, in Manila time, or null when it names none. */
export function manilaMoment(value: unknown): Date | null {
  const stamped = manilaTimestamp(value);
  if (stamped) {
    const date = new Date(stamped);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A "YYYY-MM-DDTHH:mm" value for a datetime-local input, in Manila time. */
export function toInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string): string =>
    (parts.find((part) => part.type === type) || {}).value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Today in the Manila calendar, as YYYY-MM-DD. */
export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** True when the value is a YYYY-MM-DD date. */
export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
