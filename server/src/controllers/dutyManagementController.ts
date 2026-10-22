/**
 * Duty Schedule Management — the CSDL page at `/csdl/duty-management`.
 *
 * The page is rendered on the server from the duty service, so every filter,
 * the sort order and the page number live in the address bar and survive a
 * reload. Creating, editing, deleting and assigning are ordinary form posts
 * that write to the database and redirect back, so the list always shows what
 * was actually stored.
 */
import type { Request, Response, NextFunction } from "express";
import { navFor } from "../config/navigation";
import { csrfToken } from "../lib/csrf";
import {
  DUTY_STATUSES,
  createDuty,
  deleteDuty,
  dutyStatusView,
  getDuty,
  getDutyStatusCounts,
  listAssignableUsers,
  listDuties,
  listDutyAssignments,
  listStudentIdsForDuties,
  updateDuty,
  type DutySortOrder,
  type DutyStatus,
  type DutyViewer,
} from "../services/dutyService";

/** How many duties one page of the list holds. */
export const DUTY_PAGE_SIZE = 5;

/** The filters the list is filtered by, as they travel in the address bar. */
export interface DutyPageFilters {
  status: DutyStatus | null;
  search: string | null;
  date: string | null;
  sort: DutySortOrder;
  page: number;
}

const EMPTY_FILTERS: DutyPageFilters = {
  status: null,
  search: null,
  date: null,
  sort: "newest",
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

/** True when the value is a YYYY-MM-DD date. */
function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** The filters carried by the address bar. */
function readFilters(query: Record<string, unknown>): DutyPageFilters {
  const status = DUTY_STATUSES.includes(query.status as DutyStatus)
    ? (query.status as DutyStatus)
    : null;
  const search = typeof query.q === "string" && query.q.trim() ? query.q.trim() : null;
  const date = isIsoDate(query.date) ? query.date : null;
  const sort: DutySortOrder = query.sort === "oldest" ? "oldest" : "newest";
  const page = Number.parseInt(String(query.page ?? "1"), 10);
  return {
    status,
    search,
    date,
    sort,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The filters a form posted back, used to return to the same list. */
function readPostedFilters(body: Record<string, unknown>): DutyPageFilters {
  return readFilters({
    status: body.f_status,
    q: body.f_q,
    date: body.f_date,
    sort: body.f_sort,
    page: body.f_page,
  });
}

/**
 * The address of the list, with the given filters and the given overrides.
 * Only known filter names are ever put in the query, so the result can never
 * point somewhere else. A message adds the notice the page shows on arrival.
 */
export function buildListUrl(
  filters: Partial<DutyPageFilters>,
  overrides: Partial<DutyPageFilters> = {},
  message?: string,
): string {
  const merged = { ...EMPTY_FILTERS, ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.search) params.set("q", merged.search);
  if (merged.status) params.set("status", merged.status);
  if (merged.date) params.set("date", merged.date);
  if (merged.sort && merged.sort !== "newest") params.set("sort", merged.sort);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  if (message) params.set("msg", message);
  const query = params.toString();
  return "/csdl/duty-management" + (query ? `?${query}` : "");
}

/** A Manila local "YYYY-MM-DDTHH:mm" value as a timestamp the database stores. */
function manilaTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}T${match[2]}:${match[3] || "00"}+08:00`;
}

/** A number from a form field, or null when the field is empty. */
function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The ids of the checked "student" boxes in a posted form. */
function postedStudentIds(body: Record<string, unknown>): number[] {
  const raw = body.student_ids;
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

/** The duty the page is acting on, taken from the address or the form. */
function dutyIdFrom(source: Record<string, unknown>): number | null {
  const parsed = Number(source.id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** The duty a post is about: the address wins, the form is the fallback. */
function postedDutyId(req: Request, body: Record<string, unknown>): number | null {
  return dutyIdFrom({ id: req.params.id ?? body.id });
}

/** The list page. */
export async function getDutyManagement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filters = readFilters(req.query as Record<string, unknown>);

    const scope = viewer(req);
    const result = await listDuties(scope, {
      status: filters.status,
      search: filters.search,
      date: filters.date,
      sort: filters.sort,
      page: filters.page,
      pageSize: DUTY_PAGE_SIZE,
    });
    const scopeCounts = await getDutyStatusCounts(scope, {
      search: filters.search,
      date: filters.date,
    });
    // How many duties the viewer may see at all, filters aside. It tells the
    // empty state whether the list is empty or merely filtered down.
    const scopeTotal = (await getDutyStatusCounts(scope)).all;

    // The duty being edited or assigned, when the page was asked for one.
    const editId = dutyIdFrom(req.query as Record<string, unknown>);
    const assignId = dutyIdFrom(req.query as Record<string, unknown>);
    const editDuty = editId ? await getDuty(editId) : null;
    const assignDuty = assignId ? await getDuty(assignId) : null;
    const [editAssignments, assignAssignments, dutyStudents] = await Promise.all([
      editDuty ? listDutyAssignments(editDuty.id) : Promise.resolve([]),
      assignDuty ? listDutyAssignments(assignDuty.id) : Promise.resolve([]),
      listStudentIdsForDuties(result.duties.map((duty) => duty.id)),
    ]);

    const [teachers, students] = await Promise.all([
      listAssignableUsers("TEACHER"),
      listAssignableUsers("STUDENT"),
    ]);

    const message = typeof req.query.msg === "string" ? req.query.msg : null;
    const create = req.query.create === "1" || req.query.create === "true";

    res.render("pages/duty-management", {
      ...shellLocals(req, res),
      title: "Duty Schedule Management",
      activePath: "/csdl/duty-management",
      bodyClass: "app-page",
      pageStyles: ["pages", "duty-management"],
      pageScripts: ["duty-management"],
      duties: result.duties,
      counts: scopeCounts,
      total: result.total,
      page: result.page,
      pageCount: result.pageCount,
      pageSize: result.pageSize,
      filters,
      hasAnyDuties: scopeTotal > 0,
      scopeTotal,
      teachers,
      students,
      editDuty,
      editStudentIds: editAssignments.map((row) => row.student_id),
      assignDuty,
      assignStudentIds: assignAssignments.map((row) => row.student_id),
      dutyStudents,
      statusView: dutyStatusView,
      message,
      create,
    });
  } catch (error) {
    next(error);
  }
}

/** Create a duty from the create form. */
export async function postCreateDuty(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const filters = readPostedFilters(body);
    const title = String(body.title ?? "").trim();
    const area = String(body.area ?? "").trim();
    const startTime = manilaTimestamp(body.start_time);

    if (!title || !area || !startTime) {
      res.status(400).render("status", {
        ...shellLocals(req, res),
        code: 400,
        title: "Missing details",
        message: "A duty needs a title, a location and a start time.",
      });
      return;
    }

    const status = DUTY_STATUSES.includes(body.status as DutyStatus)
      ? (body.status as DutyStatus)
      : "pending";

    await createDuty(
      {
        title,
        area,
        description: String(body.description ?? "").trim() || null,
        status,
        startTime,
        endTime: manilaTimestamp(body.end_time),
        assignedTo: optionalNumber(body.assigned_to),
        classGroup: String(body.class_group ?? "").trim() || null,
        requiredHeadcount: optionalNumber(body.required_headcount),
        studentIds: postedStudentIds(body),
      },
      req.user!.id,
    );

    res.redirect(303, buildListUrl(filters, { page: 1 }, "created"));
  } catch (error) {
    next(error);
  }
}

/** Save the changes made in the edit form. */
export async function postUpdateDuty(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const filters = readPostedFilters(body);
    const id = postedDutyId(req, body);
    if (!id) {
      res.status(404).render("status", {
        ...shellLocals(req, res),
        code: 404,
        title: "Duty not found",
        message: "That duty no longer exists.",
      });
      return;
    }

    const title = String(body.title ?? "").trim();
    const area = String(body.area ?? "").trim();
    const startTime = manilaTimestamp(body.start_time);
    if (!title || !area || !startTime) {
      res.status(400).render("status", {
        ...shellLocals(req, res),
        code: 400,
        title: "Missing details",
        message: "A duty needs a title, a location and a start time.",
      });
      return;
    }

    const status = DUTY_STATUSES.includes(body.status as DutyStatus)
      ? (body.status as DutyStatus)
      : "pending";

    await updateDuty(id, {
      title,
      area,
      description: String(body.description ?? "").trim() || null,
      status,
      startTime,
      endTime: manilaTimestamp(body.end_time),
      assignedTo: optionalNumber(body.assigned_to),
      classGroup: String(body.class_group ?? "").trim() || null,
      requiredHeadcount: optionalNumber(body.required_headcount),
      studentIds: postedStudentIds(body),
    });

    res.redirect(303, buildListUrl(filters, {}, "updated"));
  } catch (error) {
    next(error);
  }
}

/** Delete a duty. */
export async function postDeleteDuty(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const filters = readPostedFilters(body);
    const id = postedDutyId(req, body);
    if (id) {
      await deleteDuty(id);
    }
    res.redirect(303, buildListUrl(filters, {}, "deleted"));
  } catch (error) {
    next(error);
  }
}

/** Save the students and the teacher assigned to a duty. */
export async function postAssignDuty(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const filters = readPostedFilters(body);
    const id = postedDutyId(req, body);
    if (id) {
      const studentIds = postedStudentIds(body);
      const teacherId = optionalNumber(body.assigned_to);
      await updateDuty(id, { assignedTo: teacherId, studentIds });
    }
    res.redirect(303, buildListUrl(filters, {}, "assigned"));
  } catch (error) {
    next(error);
  }
}
