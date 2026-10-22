import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getLogin, postLogin, postLogout, readRememberedId } from "../controllers/authController";
import {
  getAttendanceProfile,
  getCsdlApplications,
  getCsdlDashboard,
  getCsdlDashboardJson,
  getDashboard,
  getForgotPassword,
  registerPlaceholderRoutes,
} from "../controllers/pageController";
import { getSchedule } from "../controllers/scheduleController";
import { getProfile, postProfilePassword } from "../controllers/profileController";
import { requireAuth, requirePermission, requireRole, statusLocals } from "../middleware/auth";
import { csrfToken } from "../lib/csrf";
import { audit } from "../lib/audit";
import * as app from "../controllers/dutyAppController";
import * as duty from "../controllers/dutyManagementController";

export const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    `${req.ip}::${String((req.body as Record<string, unknown> | undefined)?.identifier ?? "")
      .toLowerCase()
      .trim()}`,
  handler: (req, res) => {
    void audit("login_rate_limited", req, null, {
      identifier: String((req.body as Record<string, unknown> | undefined)?.identifier ?? ""),
    });
    res.status(429).render("login", {
      error: "Too many failed attempts. Please wait a minute and try again.",
      fieldErrors: null,
      identifier:
        readRememberedId(req) ||
        String((req.body as Record<string, unknown> | undefined)?.identifier ?? ""),
      csrfToken: csrfToken(req, res),
    });
  },
});

const router = Router();

export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = req.user as { id?: number } | undefined;
    return user && typeof user.id === "number" ? `user:${user.id}` : `ip:${req.ip}`;
  },
  handler: (req, res) => {
    void audit("password_change_rate_limited", req, req.user?.id ?? null, {});
    res.status(429).render("status", {
      ...statusLocals(req, res),
      code: 429,
      message: "Too many password change attempts. Please try again later.",
      title: "Too many attempts",
    });
  },
});

router.get("/", (_req, res) => res.redirect("/login"));

router.get("/login", getLogin);
router.post("/login", loginLimiter, postLogin);
router.post("/logout", postLogout);

router.get("/forgot-password", getForgotPassword);

router.get("/dashboard", requireAuth, requirePermission("dashboard.view"), getDashboard);
router.get("/attendance-profile", requireAuth, requirePermission("attendance.own.view"), getAttendanceProfile);

// New end-to-end pages
router.get("/todays-assignments", requireAuth, requirePermission("assignments.today.view"), app.getTodaysAssignments);
router.post("/api/assignments/:id/done", requireAuth, app.postMarkDone);

// Duty Schedule Management: the CSDL page that lists, creates, edits, deletes
// and assigns duties. The old standalone pages folded into this one.
router.get("/csdl/duty-management", requireAuth, requireRole("CSDL"), requirePermission("schedules.view"), duty.getDutyManagement);
router.post("/csdl/duty-management/duties", requireAuth, requireRole("CSDL"), requirePermission("schedules.manage"), duty.postCreateDuty);
router.post("/csdl/duty-management/duties/:id", requireAuth, requireRole("CSDL"), requirePermission("schedules.manage"), duty.postUpdateDuty);
router.post("/csdl/duty-management/duties/:id/delete", requireAuth, requireRole("CSDL"), requirePermission("schedules.manage"), duty.postDeleteDuty);
router.post("/csdl/duty-management/duties/:id/assign", requireAuth, requireRole("CSDL"), requirePermission("assign.students_teachers"), duty.postAssignDuty);
// The old address of the page still works.
router.get("/duty-management", requireAuth, requirePermission("schedules.view"), (_req, res) => res.redirect("/csdl/duty-management"));

router.get("/monitor-completion", requireAuth, requirePermission("completion.monitor"), app.getMonitorCompletion);
router.post("/api/duties/:id/complete", requireAuth, requirePermission("completion.monitor"), app.postMarkDutyComplete);
router.post("/api/duties/:id/remind", requireAuth, requirePermission("completion.monitor"), app.postSendReminder);

router.get("/applications", requireAuth, app.getApplications);
router.post("/api/applications", requireAuth, app.postCreateApplication);
router.post("/api/applications/:id/review", requireAuth, requirePermission("applications.manage"), app.postReviewApplication);

router.get("/profile-settings", requireAuth, requirePermission("profile.own"), app.getProfileSettings);
router.post("/api/profile", requireAuth, requirePermission("profile.own"), app.postProfileSettings);
router.post("/api/profile/password", requireAuth, requirePermission("profile.own"), app.postChangePasswordSettings);

// CSDL dashboard and pages (CSDL role only).
router.get("/csdl/dashboard", requireAuth, requireRole("CSDL"), requirePermission("dashboard.view"), getCsdlDashboard);
router.get("/csdl/dashboard.json", requireAuth, requireRole("CSDL"), requirePermission("dashboard.view"), getCsdlDashboardJson);
router.get("/csdl/schedule", requireAuth, requireRole("CSDL"), requirePermission("schedules.view"), getSchedule);
router.get("/csdl/applications", requireAuth, requireRole("CSDL"), requirePermission("applications.manage"), app.getApplications);
router.get("/csdl/profile", requireAuth, requireRole("CSDL"), requirePermission("settings.manage"), app.getProfileSettings);

// Schedule and profile pages
router.get("/my-schedule", requireAuth, requirePermission("schedule.own.view"), getSchedule);
router.get("/schedule", requireAuth, requirePermission("schedule.own.view"), getSchedule);
router.get("/profile", requireAuth, requirePermission("profile.own"), getProfile);
router.post("/profile/password", requireAuth, requirePermission("profile.own"), passwordChangeLimiter, postProfilePassword);

registerPlaceholderRoutes(router);

export default router;
