import type { Request, Response, NextFunction } from "express";
import { navFor } from "../config/navigation";
import { csrfToken } from "../lib/csrf";
import {
  listDutySlots, getDutySlot, createDutySlot, updateDutySlot, deleteDutySlot, checkDutyConflict,
  getAssignmentsForDuty, getMyAssignments, assignUserToDuty, removeAssignment, markAssignmentDone, markDutyComplete,
  listApplications, createApplication, reviewApplication, getCompletionStats, searchUsers, createNotification
} from "../services/appDataService";
import type { DutyViewer } from "../services/dutyService";

function shellLocals(req: Request, res: Response) {
  const user = req.user;
  return { user, nav: user ? navFor(user.role) : [], csrfToken: csrfToken(req, res) };
}

function viewer(req: Request): DutyViewer { const u = req.user!; return { id: u.id, role: u.role as any }; }

// Today's Assignments
export async function getTodaysAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const v = viewer(req);
    const today = new Date().toISOString().split("T")[0];
    const slots = await listDutySlots(v, { date: today });
    const assignments = await getMyAssignments(v, { date: today });
    res.render("pages/todays-assignments", {
      ...shellLocals(req, res),
      title: "Today's Assignments",
      activePath: "/todays-assignments",
      bodyClass: "app-page",
      pageStyles: ["pages"],
      pageScripts: ["todays-assignments"],
      slots, assignments, today
    });
  } catch (e) { next(e); }
}

export async function postMarkDone(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    await markAssignmentDone(id, req.user!.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

// Duty Schedules
export async function getDutySchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const v = viewer(req);
    const q = req.query as any;
    const slots = await listDutySlots(v, { date: q.date, class_group: q.class, person: q.person, from: q.from, to: q.to, q: q.q });
    res.render("pages/duty-schedules", {
      ...shellLocals(req, res),
      title: "Duty Schedules",
      activePath: "/duty-schedules",
      bodyClass: "app-page",
      pageStyles: ["pages"],
      pageScripts: ["duty-schedules"],
      slots, filters: q
    });
  } catch (e) { next(e); }
}

export async function getDutyDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const slot = await getDutySlot(Number(req.params.id));
    if (!slot) return res.status(404).json({ error: "Not found" });
    const assignments = await getAssignmentsForDuty(slot.id);
    res.json({ slot, assignments });
  } catch (e) { next(e); }
}

// Create/Edit Schedule
export async function getCreateEditSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const v = viewer(req);
    const slots = await listDutySlots(v, {});
    res.render("pages/create-edit-schedule", {
      ...shellLocals(req, res),
      title: "Create/Edit Schedule",
      activePath: "/create-edit-schedule",
      bodyClass: "app-page",
      pageStyles: ["pages"],
      pageScripts: ["create-edit-schedule"],
      slots
    });
  } catch (e) { next(e); }
}

export async function postCreateSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, description, area, start_time, end_time, required_headcount, class_group, assigned_to } = req.body as any;
    if (!title || !area || !start_time) return res.status(400).json({ error: "title, area, start_time required" });
    if (await checkDutyConflict(start_time, end_time)) return res.status(400).json({ error: "Time conflict with existing duty" });
    const slot = await createDutySlot({ title, description, area, start_time, end_time, required_headcount: Number(required_headcount)||1, class_group, assigned_to: assigned_to ? Number(assigned_to) : null }, req.user!.id);
    res.json({ ok: true, slot });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function putUpdateSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const body = req.body as any;
    if (body.start_time && await checkDutyConflict(body.start_time, body.end_time, id)) return res.status(400).json({ error: "Time conflict with existing duty" });
    const slot = await updateDutySlot(id, body);
    res.json({ ok: true, slot });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function deleteSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteDutySlot(Number(req.params.id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

// Assign Students & Teachers
export async function getAssignStudentsTeachers(req: Request, res: Response, next: NextFunction) {
  try {
    const v = viewer(req);
    const slots = await listDutySlots(v, {});
    res.render("pages/assign-students-teachers", {
      ...shellLocals(req, res),
      title: "Assign Students & Teachers",
      activePath: "/assign-students-teachers",
      bodyClass: "app-page",
      pageStyles: ["pages"],
      pageScripts: ["assign-students-teachers"],
      slots
    });
  } catch (e) { next(e); }
}

export async function getSlotAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const assignments = await getAssignmentsForDuty(Number(req.params.id));
    const slot = await getDutySlot(Number(req.params.id));
    res.json({ assignments, slot });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function postAssign(req: Request, res: Response, next: NextFunction) {
  try {
    const dutyId = Number(req.body.duty_id);
    const userId = Number(req.body.user_id);
    const asg = await assignUserToDuty(dutyId, userId, req.body.notes);
    await createNotification(userId, "assignment", "Duty Assignment", "You have been assigned to a duty.", `/todays-assignments`);
    res.json({ ok: true, assignment: asg });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function postRemoveAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    await removeAssignment(Number(req.params.id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getSearchUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const q = String(req.query.q || "");
    const users = await searchUsers(q, ["STUDENT", "TEACHER"]);
    res.json({ users });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

// Monitor Completion
export async function getMonitorCompletion(req: Request, res: Response, next: NextFunction) {
  try {
    const v = viewer(req);
    const q = req.query as any;
    const slots = await listDutySlots(v, { from: q.from, to: q.to, date: q.date, person: q.person });
    const stats = await getCompletionStats(v, { from: q.from, to: q.to });
    res.render("pages/monitor-completion", {
      ...shellLocals(req, res),
      title: "Monitor Completion",
      activePath: "/monitor-completion",
      bodyClass: "app-page",
      pageStyles: ["pages"],
      pageScripts: ["monitor-completion"],
      slots, stats, filters: q
    });
  } catch (e) { next(e); }
}

export async function postMarkDutyComplete(req: Request, res: Response, next: NextFunction) {
  try {
    await markDutyComplete(Number(req.params.id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function postSendReminder(req: Request, res: Response, next: NextFunction) {
  try {
    const slot = await getDutySlot(Number(req.params.id));
    if (slot && slot.assigned_to) {
      await createNotification(slot.assigned_to, "reminder", "Duty Reminder", "You have an upcoming/pending duty that needs attention.", `/todays-assignments`);
    }
    const assignments = await getAssignmentsForDuty(Number(req.params.id));
    for (const a of assignments) {
      await createNotification(a.student_id, "reminder", "Duty Reminder", "Please complete your assigned duty.", `/todays-assignments`);
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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
      apps, tab
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
