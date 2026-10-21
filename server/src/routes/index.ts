import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getLogin, postLogin, postLogout, readRememberedId } from "../controllers/authController";
import {
  getAttendanceProfile,
  getCsdlApplications,
  getCsdlDashboard,
  getCsdlDutyManagement,
  getCsdlProfile,
  getCsdlSchedule,
  getDashboard,
  getForgotPassword,
  registerPlaceholderRoutes,
} from "../controllers/pageController";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth";
import { csrfToken } from "../lib/csrf";
import { audit } from "../lib/audit";

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

router.get("/", (_req, res) => res.redirect("/login"));

router.get("/login", getLogin);
router.post("/login", loginLimiter, postLogin);
router.post("/logout", postLogout);

router.get("/forgot-password", getForgotPassword);

router.get("/dashboard", requireAuth, requirePermission("dashboard.view"), getDashboard);
router.get(
  "/attendance-profile",
  requireAuth,
  requirePermission("attendance.own.view"),
  getAttendanceProfile,
);
registerPlaceholderRoutes(router);

// CSDL dashboard and placeholder pages (CSDL role only).
router.get(
  "/csdl/dashboard",
  requireAuth,
  requireRole("CSDL"),
  requirePermission("dashboard.view"),
  getCsdlDashboard,
);
router.get(
  "/csdl/duty-management",
  requireAuth,
  requireRole("CSDL"),
  requirePermission("assignments.today.view"),
  getCsdlDutyManagement,
);
router.get(
  "/csdl/schedule",
  requireAuth,
  requireRole("CSDL"),
  requirePermission("schedules.view"),
  getCsdlSchedule,
);
router.get(
  "/csdl/applications",
  requireAuth,
  requireRole("CSDL"),
  requirePermission("applications.manage"),
  getCsdlApplications,
);
router.get(
  "/csdl/profile",
  requireAuth,
  requireRole("CSDL"),
  requirePermission("profile.own"),
  getCsdlProfile,
);

export default router;
