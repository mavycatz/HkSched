/**
 * The Duty Schedules browser — the CSDL page at `/csdl/schedule`.
 *
 * It is the one place where every schedule is seen, narrowed and acted on.
 * The filters live in the address bar, so the view can be shared or reloaded
 * as it appears, and the rows are written by ordinary form posts, so the list
 * always shows what was actually stored.
 */
import type { Request, Response, NextFunction } from "express";
import { navFor } from "../config/navigation";
import { csrfToken } from "../lib/csrf";
import { can } from "../../config/permissions";
import {
  DUTY_STATUSES,
  dutyStatusView,
  listAssignableUsers,
  listDuties,
  listDutyLocations,
  listStudentsForDuties,
  type DutyStatus,
  type DutyViewer,
} from "../services/dutyService";
import { readDutyModalState } from "./dutyModalState";
import { isIsoDate } from "../lib/time";

/** How many schedules one page of the browser holds. */
export const SCHEDULE_PAGE_SIZE = 9;

/** The filters the browser is narrowed by. */
export interface BrowserFilters {
  search: string | null;
  from: string | null;
  to: string | null;
  locationId: number | null;
  teacherId: number | null;
  status: DutyStatus | null;
  page: number;
}

const EMPTY_FILTERS: BrowserFilters = {
  search: null,
  from: null,
  to: null,
  locationId: null,
  teacherId: null,
  status: null,
  page: 1,
};

function shellLocals(req: Request, res: Response) {
  const user = req.user;
  return { user, nav: user ? navFor(user.role) : [], csrfToken: csrfToken(req, res) };
}

function viewer(req: Request): DutyViewer {
  const user = req.user!;
  return { id: user.id, role: user.role as DutyViewer["role"] };
}

/** A number from the query string, or null when it is not one. */
function queryNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** The filters carried by the address bar. */
export function readBrowserFilters(query: Record<string, unknown>): BrowserFilters {
  const status = DUTY_STATUSES.includes(query.status as DutyStatus)
    ? (query.status as DutyStatus)
    : null;
  const search = typeof query.q === "string" && query.q.trim() ? query.q.trim() : null;
  const page = Number.parseInt(String(query.page ?? "1"), 10);
  return {
    search,
    from: isIsoDate(query.from) ? query.from : null,
    to: isIsoDate(query.to) ? query.to : null,
    locationId: queryNumber(query.location),
    teacherId: queryNumber(query.teacher),
    status,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The address of the browser, with the given filters and overrides. */
export function buildBrowserUrl(
  filters: Partial<BrowserFilters>,
  overrides: Partial<BrowserFilters> = {},
  message?: string,
): string {
  const merged = { ...EMPTY_FILTERS, ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.search) params.set("q", merged.search);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.locationId) params.set("location", String(merged.locationId));
  if (merged.teacherId) params.set("teacher", String(merged.teacherId));
  if (merged.status) params.set("status", merged.status);
  if (merged.page > 1) params.set("page", String(merged.page));
  if (message) params.set("msg", message);
  const query = params.toString();
  return "/csdl/schedule" + (query ? `?${query}` : "");
}

/** The browser page: the list, its filters and the row actions. */
export async function getScheduleBrowser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = readBrowserFilters(req.query as Record<string, unknown>);
    const scope = viewer(req);

    const result = await listDuties(scope, {
      status: filters.status,
      search: filters.search,
      from: filters.from,
      to: filters.to,
      locationId: filters.locationId,
      teacherId: filters.teacherId,
      page: filters.page,
      pageSize: SCHEDULE_PAGE_SIZE,
    });

    const studentsByDuty = await listStudentsForDuties(
      result.duties.map((duty) => duty.id),
    );

    // The filters are chosen from the catalogue and from the active teachers.
    const [locations, teachers] = await Promise.all([
      listDutyLocations({ activeOnly: true }),
      listAssignableUsers("TEACHER"),
    ]);

    // Which modal the address asks for, and what it holds.
    const modal = await readDutyModalState(req.query as Record<string, unknown>);

    const message = typeof req.query.msg === "string" ? req.query.msg : null;

    res.render("pages/schedule-browser", {
      ...shellLocals(req, res),
      title: "Duty Schedules",
      activePath: "/csdl/schedule",
      bodyClass: "app-page",
      pageStyles: ["pages", "schedule", "components"],
      pageScripts: ["duty-management"],
      duties: result.duties,
      studentsByDuty,
      filterLocations: locations,
      filterTeachers: teachers,
      total: result.total,
      page: result.page,
      pageCount: result.pageCount,
      pageSize: result.pageSize,
      filters,
      statusView: dutyStatusView,
      // The write actions are only offered to a reader who may make them.
      canManage: can(req.user!.role, "schedules.manage"),
      ...modal,
      message,
      returnTo: "/csdl/schedule",
    });
  } catch (error) {
    next(error);
  }
}
