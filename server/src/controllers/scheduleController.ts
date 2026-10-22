import type { Request, Response, NextFunction } from "express";
import { statusLocals } from "../middleware/auth";
import {
  getDutiesForDay,
  getMonthGrid,
  type DutyListItem,
  type DutyStatus,
} from "../services/dutyService";

/**
 * The schedule view — a month calendar beside the duties of the selected day.
 *
 * One controller serves `/csdl/schedule`, `/my-schedule` and `/schedule`; the
 * scope of the data is decided by the duty service, which reads the viewer's
 * role: a CSDL user sees every duty, a teacher or a student sees only their
 * own. The calendar and the day selection are ordinary links, so the page
 * works without JavaScript and the selection stays shareable in the URL.
 */

const MANILA = "Asia/Manila";

/** Monday-first, the order the school week runs in. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SCHEDULE_STATUSES: DutyStatus[] = ["ongoing", "completed", "pending", "cancelled"];

export interface ScheduleLegendEntry {
  status: DutyStatus;
  label: string;
}

export interface ScheduleDayCell {
  /** YYYY-MM-DD. */
  date: string;
  day: number;
  count: number;
  /** One entry per duty, so the cell can show a dot per duty. */
  statuses: DutyStatus[];
  isToday: boolean;
  isSelected: boolean;
  /** The cell's accessible name. */
  label: string;
  /** Plain-language state, read out for the selected and current days. */
  stateLabel: string;
  url: string;
}

export interface ScheduleDutyCard {
  id: number;
  title: string;
  area: string;
  status: DutyStatus;
  statusLabel: string;
  timeLabel: string;
  studentCount: number;
}

interface ManilaDate {
  year: number;
  month: number;
  day: number;
  date: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The calendar parts of a moment, in the Manila calendar. */
function manilaDate(moment: Date): ManilaDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(moment);
  const get = (type: string) => (parts.find((p) => p.type === type) || {}).value || "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** A date at midday, so a formatter in +08:00 cannot roll it to another day. */
function midday(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

function isIsoMonth(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  month: "long",
  year: "numeric",
});
const DAY_LABEL = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  month: "long",
  day: "numeric",
});
const FULL_DAY_LABEL = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const TIME_LABEL = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** The month and the selected day, from the query string. */
function resolveSelection(
  query: Record<string, string>,
  today: ManilaDate,
): { year: number; month: number; date: string } {
  // A valid date is authoritative — the grid always shows the month that
  // holds the selected day, so the two can never disagree.
  if (isIsoDate(query.date)) {
    return {
      year: Number(query.date.slice(0, 4)),
      month: Number(query.date.slice(5, 7)),
      date: query.date,
    };
  }
  if (isIsoMonth(query.month)) {
    const year = Number(query.month.slice(0, 4));
    const month = Number(query.month.slice(5, 7));
    // Today stays selected while its month is on screen; otherwise the
    // first of the month is.
    const date =
      today.year === year && today.month === month
        ? today.date
        : `${query.month}-01`;
    return { year, month, date };
  }
  return { year: today.year, month: today.month, date: today.date };
}

/** The query string for a month, keeping the day of the month where possible. */
function monthQuery(year: number, month: number, day: number): string {
  const clamped = Math.min(Math.max(day, 1), daysInMonth(year, month));
  return `month=${year}-${pad(month)}&date=${year}-${pad(month)}-${pad(clamped)}`;
}

function buildUrl(basePath: string, query: string): string {
  return `${basePath}?${query}`;
}

function toDutyCard(duty: DutyListItem): ScheduleDutyCard {
  const start = TIME_LABEL.format(new Date(duty.start_time));
  const end = duty.end_time ? TIME_LABEL.format(new Date(duty.end_time)) : "—";
  return {
    id: duty.id,
    title: duty.title,
    // The catalogue location, or the legacy area text when there is none.
    area: duty.location_name || duty.area,
    status: duty.status,
    statusLabel: titleCase(duty.status),
    timeLabel: `${start} – ${end}`,
    studentCount: duty.student_count,
  };
}

export async function getSchedule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const viewer = { id: user.id, role: user.role };
    const query = req.query as Record<string, string>;
    const basePath = req.path;

    const today = manilaDate(new Date());
    const { year, month, date: selectedDate } = resolveSelection(query, today);

    const grid = await getMonthGrid(viewer, year, month);
    const dayDuties = await getDutiesForDay(viewer, selectedDate);

    const selectedDay = Number(selectedDate.slice(8, 10));
    const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

    // The grid starts on a Monday, so the first of the month may need padding.
    const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const cells: (ScheduleDayCell | null)[] = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);

    for (const day of grid.days) {
      const isToday = day.date === today.date;
      const isSelected = day.date === selectedDate;
      const count = day.count;
      const dayNumber = Number(day.date.slice(8, 10));
      const dayLabel = DAY_LABEL.format(midday(year, month, dayNumber));
      const stateParts: string[] = [];
      if (isToday) stateParts.push("Today");
      if (isSelected) stateParts.push("Selected");
      const stateLabel = stateParts.join(", ");

      cells.push({
        date: day.date,
        day: dayNumber,
        count,
        statuses: day.statuses,
        isToday,
        isSelected,
        label: `${dayLabel}, ${count} ${count === 1 ? "duty" : "duties"}${stateLabel ? `, ${stateLabel}` : ""}`,
        stateLabel,
        url: buildUrl(basePath, monthQuery(year, month, dayNumber)),
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: (ScheduleDayCell | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const legend: ScheduleLegendEntry[] = SCHEDULE_STATUSES.map((status) => ({
      status,
      label: titleCase(status),
    }));

    const subtitle =
      user.role === "CSDL"
        ? "Every duty across all assignees."
        : user.role === "TEACHER"
          ? "The duties assigned to you."
          : "The duties you are assigned to.";

    res.render("pages/schedule", {
      ...statusLocals(req, res),
      title: "Schedule",
      bodyClass: "schedule-page",
      activePath: basePath,
      pageStyles: ["schedule"],
      subtitle,
      monthLabel: MONTH_LABEL.format(midday(year, month, 1)),
      selectedDayLabel: FULL_DAY_LABEL.format(midday(year, month, selectedDay)),
      selectedDayShort: DAY_LABEL.format(midday(year, month, selectedDay)),
      previousUrl: buildUrl(basePath, monthQuery(previous.year, previous.month, selectedDay)),
      nextUrl: buildUrl(basePath, monthQuery(next.year, next.month, selectedDay)),
      currentUrl: buildUrl(basePath, monthQuery(today.year, today.month, today.day)),
      weekdayLabels: WEEKDAY_LABELS,
      weeks,
      legend,
      duties: dayDuties.map(toDutyCard),
      dutyCount: dayDuties.length,
    });
  } catch (err) {
    next(err);
  }
}
