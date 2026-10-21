import type { Request, Response } from "express";
import { navFor, type NavItem } from "../config/navigation";
import type { Role } from "../../config/permissions";
import { requireAuth, requirePermission } from "../middleware/auth";
import { csrfToken } from "../lib/csrf";
import { canViewStudentRecord, sendNotFound } from "../lib/authorization";
import { getDashboardData } from "../services/dashboardService";

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
  { path: "/my-schedule", title: "My Schedule", permission: "schedule.own.view" },
  { path: "/schedule", title: (role) => (role === "TEACHER" ? "My Schedule" : "Schedule"), permission: "schedule.own.view" },
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
  { path: "/profile", title: "Profile", permission: "profile.own" },
  { path: "/settings", title: "Settings", permission: "settings.manage" },
  { path: "/profile-settings", title: "Profile & Settings", permission: "settings.manage" },
  { path: "/duty-schedules", title: "Duty Schedules", permission: "schedules.view" },
  { path: "/create-edit-schedule", title: "Create/Edit Schedule", permission: "schedules.manage" },
  { path: "/assign-students-teachers", title: "Assign Students & Teachers", permission: "assign.students_teachers" },
  { path: "/monitor-completion", title: "Monitor Completion", permission: "completion.monitor" },
];

function shellLocals(req: Request, res: Response) {
  const user = req.user!;
  return {
    user,
    nav: navFor(user.role),
    csrfToken: csrfToken(req, res),
  };
}

export function getDashboard(req: Request, res: Response): void {
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

/** CSDL Dashboard — greeting computed in Asia/Manila timezone, data from stub service. */
export async function getCsdlDashboard(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const data = await getDashboardData();

  // Greeting by time of day in Asia/Manila (UTC+8).
  const manilaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const hours = manilaTime.getHours();
  const greeting = hours < 12 ? "Good morning" : hours < 18 ? "Good afternoon" : "Good evening";

  // Display name: first name (no honorific data is stored on the user record).
  const displayName = user.full_name.split(/\s+/)[0];

  // Today's date, e.g. "Wednesday, October 21, 2026".
  const todayDate = manilaTime.toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  res.render("pages/csdl/dashboard", {
    ...shellLocals(req, res),
    title: "Dashboard",
    activePath: "/csdl/dashboard",
    greeting,
    displayName,
    todayDate,
    totals: data.totals,
    assignmentsToday: data.assignmentsToday,
  });
}

export function getCsdlDutyManagement(req: Request, res: Response): void {
  res.render("pages/csdl/duty-management", {
    ...shellLocals(req, res),
    title: "Duty Management",
    activePath: "/csdl/duty-management",
  });
}

export function getCsdlSchedule(req: Request, res: Response): void {
  res.render("pages/csdl/schedule", {
    ...shellLocals(req, res),
    title: "Schedule",
    activePath: "/csdl/schedule",
  });
}

export function getCsdlApplications(req: Request, res: Response): void {
  res.render("pages/csdl/applications", {
    ...shellLocals(req, res),
    title: "Applications",
    activePath: "/csdl/applications",
  });
}

export function getCsdlProfile(req: Request, res: Response): void {
  res.render("pages/csdl/profile", {
    ...shellLocals(req, res),
    title: "Profile & Settings",
    activePath: "/csdl/profile",
  });
}
