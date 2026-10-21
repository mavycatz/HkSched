import type { Request, Response, NextFunction } from "express";
import { navFor, type NavItem } from "../config/navigation";
import type { Role } from "../../config/permissions";
import { requireAuth, requirePermission } from "../middleware/auth";
import { csrfToken } from "../lib/csrf";
import { canViewStudentRecord, sendNotFound } from "../lib/authorization";
import { getDashboardSummary, computeRange } from "../services/dashboardService";
import {
  DUTY_STATUSES,
  getDutyStatusCounts,
  listDuties,
  type DutyStatus,
} from "../services/dutyService";

interface Placeholder {
  path: string;
  title: string | ((role: Role) => string);
  permission: string | Record<Role, string>;
}

const PLACEHOLDERS: Placeholder[] = [
  { path: "/todays-assignments", title: "Today's Assignments", permission: "assignments.today.view" },
  { path: "/assignments", title: "Assignments", permission: "assignments.manage" },
  { path: "/verification", title: "Verification", permission: "duty.verify" },
  { path: "/approvals", title: "Approvals", permission: "approvals.review" },
  { path: "/my-duties", title: "My Duties", permission: "duties.own.view" },
  { path: "/upcoming-duties", title: "Upcoming Duties", permission: "duties.upcoming.view" },
  {
    path: "/applications",
    title: "Applications",
    permission: {
      STUDENT: "applications.own.view",
      TEACHER: "applications.own.view",
      CSDL: "applications.manage",
    },
  },
  { path: "/settings", title: "Settings", permission: "settings.manage" },
  { path: "/profile-settings", title: "Profile & Settings", permission: "settings.manage" },
  { path: "/duty-schedules", title: "Duty Schedules", permission: "schedules.view" },
  { path: "/create-edit-schedule", title: "Create/Edit Schedule", permission: "schedules.manage" },
  { path: "/assign-students-teachers", title: "Assign Students & Teachers", permission: "assign.students_teachers" },
  { path: "/monitor-completion", title: "Monitor Completion", permission: "completion.monitor" },
];

/** True when the value is a YYYY-MM-DD date. */
function isIsoDate(value: string | undefined): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shellLocals(req: Request, res: Response) {  const user = req.user;
  return {
    user,
    nav: user ? navFor(user.role) : [],
    csrfToken: csrfToken(req, res),
  };
}

/** Shell locals for error/status pages; safe when nobody is signed in. */
export function statusLocals(req: Request, res: Response) {
  return shellLocals(req, res);
}

export function getDashboard(req: Request, res: Response): void {
  const user = req.user!;
  if (user.role === "CSDL") {
    res.redirect("/csdl/dashboard");
    return;
  }
  res.render("dashboard", {
    ...shellLocals(req, res),
    title: "Dashboard",
    activePath: "/dashboard",
  });
}

export function makePlaceholder(placeholder: Placeholder) {
  return (req: Request, res: Response): void => {
    const user = req.user!;
    const key =
      typeof placeholder.permission === "string"
        ? placeholder.permission
        : placeholder.permission[user.role];
    const title =
      typeof placeholder.title === "function" ? placeholder.title(user.role) : placeholder.title;
    res.render("placeholder", {
      ...shellLocals(req, res),
      title,
      featureTitle: title,
      activePath: placeholder.path,
    });
  };
}

export function placeholderRoute(path: string): Placeholder {
  const found = PLACEHOLDERS.find((p) => p.path === path);
  if (!found) throw new Error(`No placeholder registered for ${path}`);
  return found;
}

export function registerPlaceholderRoutes(
  router: import("express").Router,
): void {
  for (const placeholder of PLACEHOLDERS) {
    const permission = placeholder.permission;
    const middlewares: import("express").RequestHandler[] = [requireAuth];
    if (typeof permission === "string") {
      middlewares.push(requirePermission(permission));
    } else {
      middlewares.push((req, res, next) => {
        const user = req.user;
        if (!user) {
          res.redirect("/login");
          return;
        }
        requirePermission(permission[user.role])(req, res, next);
      });
    }
    router.get(placeholder.path, ...middlewares, makePlaceholder(placeholder));
  }
}

export function getForgotPassword(_req: Request, res: Response): void {
  res.render("forgot", { title: "Forgot Password" });
}

/**
 * Attendance Profile — a record-scoped page demonstrating record-level
 * authorization: `?student=<school_id>` outside the viewer's scope is a 404.
 */
export async function getAttendanceProfile(
  req: Request,
  res: Response,
  next: import("express").NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const requested =
      typeof req.query.student === "string" && req.query.student
        ? req.query.student
        : user.school_id;
    const allowed = await canViewStudentRecord(user, requested);
    if (!allowed) {
      sendNotFound(res);
      return;
    }
    res.render("placeholder", {
      ...shellLocals(req, res),
      title: "Attendance Profile",
      featureTitle: "Attendance Profile",
      activePath: "/attendance-profile",
    });
  } catch (err) {
    next(err);
  }
}

/** CSDL Dashboard — greeting computed in Asia/Manila timezone, data from real DB with range filter. */
export async function getCsdlDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    // Parse range from query string (default: today)
    const range = computeRange(req.query as Record<string, string>);

    // Fetch summary + assignments for the range
    const data = await getDashboardSummary(user, range);

    // Greeting by time of day in Asia/Manila (UTC+8).
    const manilaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const hours = manilaTime.getHours();
    const greeting = hours < 12 ? "Good morning" : hours < 18 ? "Good afternoon" : "Good evening";

    // Display name: first name (no honorific data is stored on the user record).
    const displayName = user.full_name.split(/\s+/)[0];

    // Active range label for display, e.g. "Wednesday, October 21, 2026"
    const todayDate = range.rangeLabel;

    res.render("pages/csdl/dashboard", {
      ...shellLocals(req, res),
      title: "Dashboard",
      activePath: "/csdl/dashboard",
      bodyClass: "csdl-page",
      pageStyles: ["dashboard"],
      greeting,
      displayName,
      todayDate,
      rangeKey: range.rangeKey,
      rangeLabel: range.rangeLabel,
      rangeFrom: range.from.toISOString().split("T")[0],
      rangeTo: range.to.toISOString().split("T")[0],
      totals: data.totals,
      assignmentsToday: data.assignmentsToday,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCsdlDutyManagement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const query = req.query as Record<string, string>;

    const status = DUTY_STATUSES.includes(query.status as DutyStatus)
      ? (query.status as DutyStatus)
      : null;
    const search = typeof query.q === "string" ? query.q.trim() : null;
    const from = isIsoDate(query.from) ? query.from : null;
    const to = isIsoDate(query.to) ? query.to : null;
    const page = Number.parseInt(query.page ?? "1", 10);
    const pageSize = 9;

    const result = await listDuties(
      { id: user.id, role: user.role },
      { status, search, from, to, page: Number.isFinite(page) ? page : 1, pageSize },
    );

    // The unfiltered scope total decides between "no duties exist" and
    // "no duty matches the current filters".
    const scopeCounts = await getDutyStatusCounts({ id: user.id, role: user.role });

    res.render("pages/csdl/duty-management", {
      ...shellLocals(req, res),
      title: "Duty Management",
      activePath: "/csdl/duty-management",
      bodyClass: "csdl-page",
      pageStyles: ["duty-management"],
      pageScripts: ["duty-management"],
      duties: result.duties,
      counts: result.counts,
      total: result.total,
      page: result.page,
      pageCount: result.pageCount,
      pageSize: result.pageSize,
      filters: { status, search, from, to },
      hasAnyDuties: scopeCounts.all > 0,
    });
  } catch (err) {
    next(err);
  }
}

export function getCsdlApplications(req: Request, res: Response): void {
  res.render("pages/csdl/applications", {
    ...shellLocals(req, res),
    title: "Applications",
    activePath: "/csdl/applications",
    bodyClass: "csdl-page",
  });
}

/** JSON endpoint for the dashboard summary — used by the range filter without full reload. */
export async function getCsdlDashboardJson(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const range = computeRange(req.query as Record<string, string>);
    const data = await getDashboardSummary(user, range);

    res.json({
      rangeKey: range.rangeKey,
      rangeLabel: range.rangeLabel,
      rangeFrom: range.from.toISOString().split("T")[0],
      rangeTo: range.to.toISOString().split("T")[0],
      totals: data.totals,
      assignmentsToday: data.assignmentsToday,
    });
  } catch (err) {
    next(err);
  }
}
