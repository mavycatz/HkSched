import type { Request, Response, NextFunction } from "express";
import { navFor } from "../config/navigation";
import { csrfToken } from "../lib/csrf";
import { jsonForScript } from "../lib/json";
import { can } from "../../config/permissions";
import {
  listApplications,
  createApplication,
  reviewApplication,
} from "../services/appDataService";
import { listDuties, listStudentsForDuties, type DutyViewer } from "../services/dutyService";
import { manilaToday } from "../lib/time";

function shellLocals(req: Request, res: Response) {
  const user = req.user;
  return { user, nav: user ? navFor(user.role) : [], csrfToken: csrfToken(req, res) };
}

function viewer(req: Request): DutyViewer { const u = req.user!; return { id: u.id, role: u.role as any }; }

// Today's Assignments
export async function getTodaysAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const v = viewer(req);
    const today = manilaToday();
    // The page shows the signed-in teacher's own duties: the duty service
    // scopes the query by the viewer's role, so a teacher never sees another
    // teacher's duties and a CSDL sees every one.
    const result = await listDuties(v, { date: today, pageSize: 50 });
    const studentsByDuty = await listStudentsForDuties(result.duties.map((duty) => duty.id));
    res.render("pages/todays-assignments", {
      ...shellLocals(req, res),
      title: "Today's Assignments",
      activePath: "/todays-assignments",
      bodyClass: "app-page",
      pageStyles: ["pages"],
      pageScripts: ["todays-assignments"],
      duties: result.duties,
      studentsByDuty,
      today,
      // Only a role that may record a completion is offered the control.
      canRecord: can(req.user!.role, "completion.record"),
      jsonForScript
    });
  } catch (e) { next(e); }
}

// Applications
export async function getApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const v = viewer(req);
    const tab = String(req.query.tab || "pending");
    const apps = await listApplications(v, tab as any);
    res.render("pages/applications", {
      ...shellLocals(req, res),
      title: "Applications",
      activePath: req.user?.role === "CSDL" ? "/csdl/applications" : "/applications",
      bodyClass: "app-page",
      pageStyles: ["pages"],
      pageScripts: ["applications"],
      apps, tab, jsonForScript
    });
  } catch (e) { next(e); }
}

export async function postCreateApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const app = await createApplication(req.user!.id, req.body as any);
    res.json({ ok: true, application: app });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function postReviewApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await reviewApplication(Number(req.params.id), req.user!.id, req.body.action, req.body.note);
    res.json({ ok: true, application: result });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

// Profile & Settings
import { getUserProfile, updateUserProfile } from "../services/appDataService";
import { updatePasswordHash } from "../lib/users";
import { verifyPassword } from "../lib/password";

export async function getProfileSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getUserProfile(req.user!.id);
    res.render("pages/profile-settings", {
      ...shellLocals(req, res),
      title: "Profile & Settings",
      activePath: req.user?.role === "CSDL" ? "/csdl/profile" : "/profile-settings",
      bodyClass: "app-page",
      pageStyles: ["pages"],
      pageScripts: ["profile-settings"],
      profile
    });
  } catch (e) { next(e); }
}

export async function postProfileSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, phone, contact_info, notification_preferences } = req.body as any;
    const profile = await updateUserProfile(req.user!.id, { name, email, phone, contact_info, notification_preferences });
    res.json({ ok: true, profile });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function postChangePasswordSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const { current_password, new_password, confirm_password } = req.body as any;
    if (!new_password || new_password.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
    if (new_password !== confirm_password) return res.status(400).json({ error: "Passwords do not match." });
    const { findUserById } = await import("../lib/users");
    const user = await findUserById(req.user!.id);
    if (!user || !user.password_hash) return res.status(400).json({ error: "Invalid request." });
    const ok = await verifyPassword(current_password || "", user.password_hash);
    if (!ok) return res.status(400).json({ error: "Current password is incorrect." });
    if (await verifyPassword(new_password, user.password_hash)) return res.status(400).json({ error: "New password must be different from the current password." });
    await updatePasswordHash(user.id, new_password);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}
