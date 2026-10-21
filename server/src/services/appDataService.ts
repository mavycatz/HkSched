import { getPool } from "../db/pool";
import type { DutyViewer } from "./dutyService";

export type AppStatus = "pending" | "approved" | "rejected";
export type AssignmentStatus = "assigned" | "done" | "completed";
export type NotificationType = "application_approved" | "application_rejected" | "reminder" | "assignment" | "general";

export interface UserProfile {
  id: number;
  school_id: string;
  name: string;
  email: string | null;
  role: "STUDENT" | "TEACHER" | "CSDL";
  phone: string | null;
  contact_info: Record<string, unknown>;
  notification_preferences: Record<string, boolean>;
  is_active: boolean;
}

export interface DutySlot {
  id: number;
  title: string;
  description: string | null;
  area: string;
  status: string;
  start_time: Date | string;
  end_time: Date | string | null;
  assigned_to: number | null;
  assigned_by: number | null;
  required_headcount: number;
  class_group: string | null;
  assignee_name?: string | null;
  assignee_school_id?: string | null;
  student_count?: number;
}

export interface Assignment {
  id: number;
  duty_id: number;
  student_id: number;
  status: AssignmentStatus;
  notes: string | null;
  completed_at: Date | string | null;
  completed_by: number | null;
  created_at: Date | string;
  student_name?: string;
  student_school_id?: string;
  duty_title?: string;
  duty_area?: string;
  duty_date?: string;
  start_time?: Date | string;
}

export interface Application {
  id: number;
  applicant_id: number;
  duty_id: number | null;
  duty_title: string | null;
  duty_area: string | null;
  duty_date: string | null;
  message: string | null;
  status: AppStatus;
  reviewed_by: number | null;
  review_note: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
  applicant_name?: string;
  applicant_school_id?: string;
  applicant_role?: string;
}

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: Date | string;
}

function scopeDuty(viewer: DutyViewer, params: unknown[]): string {
  if (viewer.role === "CSDL") return "TRUE";
  if (viewer.role === "TEACHER") {
    params.push(viewer.id);
    return `(d.assigned_to = $${params.length} OR EXISTS (SELECT 1 FROM duty_assignments da WHERE da.duty_id = d.id AND da.student_id = $${params.length}))`;
  }
  params.push(viewer.id);
  return `EXISTS (SELECT 1 FROM duty_assignments da WHERE da.duty_id = d.id AND da.student_id = $${params.length})`;
}

// Users
export async function getUserProfile(userId: number): Promise<UserProfile | null> {
  const { rows } = await getPool().query<UserProfile>(
    `SELECT id, school_id, name, email, role, phone, COALESCE(contact_info,'{}'::jsonb) as contact_info, COALESCE(notification_preferences,'{"email":true,"in_app":true}'::jsonb) as notification_preferences, is_active
     FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] || null;
}

export async function updateUserProfile(userId: number, data: Partial<Pick<UserProfile, "name" | "email" | "phone" | "contact_info" | "notification_preferences">>): Promise<UserProfile | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (data.name !== undefined) { fields.push(`name = $${i++}`); params.push(data.name); }
  if (data.email !== undefined) { fields.push(`email = $${i++}`); params.push(data.email); }
  if (data.phone !== undefined) { fields.push(`phone = $${i++}`); params.push(data.phone); }
  if (data.contact_info !== undefined) { fields.push(`contact_info = $${i++}::jsonb`); params.push(JSON.stringify(data.contact_info)); }
  if (data.notification_preferences !== undefined) { fields.push(`notification_preferences = $${i++}::jsonb`); params.push(JSON.stringify(data.notification_preferences)); }
  if (fields.length === 0) return getUserProfile(userId);
  fields.push(`updated_at = now()`);
  params.push(userId);
  const { rows } = await getPool().query<UserProfile>(
    `UPDATE users SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, school_id, name, email, role, phone, COALESCE(contact_info,'{}'::jsonb) as contact_info, COALESCE(notification_preferences,'{"email":true,"in_app":true}'::jsonb) as notification_preferences, is_active`,
    params,
  );
  return rows[0] || null;
}

export async function searchUsers(q: string, roles?: Array<"STUDENT" | "TEACHER">): Promise<Array<{ id: number; name: string; school_id: string; role: string; email: string | null }>> {
  const params: unknown[] = [];
  let where = `is_active = TRUE`;
  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    where += ` AND (name ILIKE $${params.length} OR school_id ILIKE $${params.length} OR email ILIKE $${params.length})`;
  }
  if (roles && roles.length) {
    params.push(roles);
    where += ` AND role = ANY($${params.length}::user_role[])`;
  }
  const { rows } = await getPool().query(
    `SELECT id, name, school_id, role, email FROM users WHERE ${where} ORDER BY name ASC LIMIT 50`,
    params,
  );
  return rows;
}

// Duties/Slots
export async function listDutySlots(viewer: DutyViewer, filters: { date?: string; from?: string; to?: string; class_group?: string; person?: string; q?: string } = {}): Promise<DutySlot[]> {
  const params: unknown[] = [];
  const clauses: string[] = [scopeDuty(viewer, params)];
  if (filters.date) {
    params.push(filters.date);
    clauses.push(`d.start_time::date = $${params.length}::date`);
  }
  if (filters.from) {
    params.push(`${filters.from}T00:00:00+08:00`);
    clauses.push(`d.start_time >= $${params.length}`);
  }
  if (filters.to) {
    params.push(`${filters.to}T23:59:59.999+08:00`);
    clauses.push(`d.start_time <= $${params.length}`);
  }
  if (filters.class_group) {
    params.push(filters.class_group);
    clauses.push(`d.class_group = $${params.length}`);
  }
  if (filters.person) {
    params.push(filters.person);
    clauses.push(`(u.name ILIKE $${params.length} OR u.school_id ILIKE $${params.length})`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const idx = params.length;
    clauses.push(`(d.title ILIKE $${idx} OR d.area ILIKE $${idx} OR d.description ILIKE $${idx})`);
  }
  const { rows } = await getPool().query<DutySlot>(
    `SELECT d.*, u.name as assignee_name, u.school_id as assignee_school_id, (SELECT count(*)::int FROM duty_assignments da WHERE da.duty_id = d.id) as student_count
     FROM duties d LEFT JOIN users u ON u.id = d.assigned_to
     WHERE ${clauses.join(" AND ")}
     ORDER BY d.start_time ASC, d.id ASC`,
    params,
  );
  return rows;
}

export async function getDutySlot(id: number): Promise<DutySlot | null> {
  const { rows } = await getPool().query<DutySlot>(
    `SELECT d.*, u.name as assignee_name, u.school_id as assignee_school_id, (SELECT count(*)::int FROM duty_assignments da WHERE da.duty_id = d.id) as student_count
     FROM duties d LEFT JOIN users u ON u.id = d.assigned_to WHERE d.id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function createDutySlot(data: { title: string; description?: string | null; area: string; start_time: string; end_time?: string | null; assigned_to?: number | null; status?: string; required_headcount?: number; class_group?: string | null }, actorId?: number): Promise<DutySlot> {
  const { rows } = await getPool().query<DutySlot>(
    `INSERT INTO duties (title, description, area, start_time, end_time, assigned_to, assigned_by, status, required_headcount, class_group)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,1),$10)
     RETURNING *`,
    [data.title, data.description || null, data.area, data.start_time, data.end_time || null, data.assigned_to || null, actorId || null, data.status || "pending", data.required_headcount || 1, data.class_group || null],
  );
  return rows[0];
}

export async function updateDutySlot(id: number, data: Partial<DutySlot>): Promise<DutySlot | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  const allowed = ["title", "description", "area", "start_time", "end_time", "assigned_to", "status", "required_headcount", "class_group"];
  for (const key of allowed) {
    if ((data as any)[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      params.push((data as any)[key]);
    }
  }
  if (fields.length === 0) return getDutySlot(id);
  fields.push(`updated_at = now()`);
  params.push(id);
  const { rows } = await getPool().query<DutySlot>(`UPDATE duties SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`, params);
  return rows[0] || null;
}

export async function deleteDutySlot(id: number): Promise<boolean> {
  const { rowCount } = await getPool().query("DELETE FROM duties WHERE id = $1", [id]);
  return (rowCount || 0) > 0;
}

export async function checkDutyConflict(startTime: string, endTime?: string | null, excludeId?: number): Promise<boolean> {
  const params: unknown[] = [startTime];
  let where = `start_time = $1`;
  if (excludeId) { params.push(excludeId); where += ` AND id != $${params.length}`; }
  if (endTime) { params.push(endTime); where += ` AND (end_time = $${params.length} OR end_time IS NULL)`; }
  const { rowCount } = await getPool().query(`SELECT 1 FROM duties WHERE ${where} LIMIT 1`, params);
  return (rowCount || 0) > 0;
}

// Assignments
export async function getAssignmentsForDuty(dutyId: number): Promise<Assignment[]> {
  const { rows } = await getPool().query<Assignment>(
    `SELECT da.*, u.name as student_name, u.school_id as student_school_id, d.title as duty_title, d.area as duty_area, d.start_time
     FROM duty_assignments da
     JOIN users u ON u.id = da.student_id
     JOIN duties d ON d.id = da.duty_id
     WHERE da.duty_id = $1 ORDER BY da.created_at ASC`,
    [dutyId],
  );
  return rows;
}

export async function getMyAssignments(viewer: DutyViewer, filters: { date?: string; status?: string } = {}): Promise<Assignment[]> {
  const params: unknown[] = [];
  let where = `1=1`;
  if (viewer.role === "STUDENT") { params.push(viewer.id); where += ` AND da.student_id = $${params.length}`; }
  else if (viewer.role === "TEACHER") { params.push(viewer.id); where += ` AND (d.assigned_to = $${params.length} OR da.student_id = $${params.length})`; }
  if (filters.date) { params.push(filters.date); where += ` AND d.start_time::date = $${params.length}::date`; }
  if (filters.status) { params.push(filters.status); where += ` AND COALESCE(da.status,'assigned') = $${params.length}`; }
  const { rows } = await getPool().query<Assignment>(
    `SELECT da.*, u.name as student_name, u.school_id as student_school_id, d.title as duty_title, d.area as duty_area, d.start_time
     FROM duty_assignments da
     JOIN users u ON u.id = da.student_id
     JOIN duties d ON d.id = da.duty_id
     WHERE ${where} ORDER BY d.start_time ASC`,
    params,
  );
  return rows;
}

export async function assignUserToDuty(dutyId: number, userId: number, notes?: string): Promise<Assignment> {
  const { rows } = await getPool().query<Assignment>(
    `INSERT INTO duty_assignments (duty_id, student_id, notes, status) VALUES ($1,$2,$3,'assigned') ON CONFLICT DO NOTHING RETURNING *`,
    [dutyId, userId, notes || null],
  );
  if (rows[0]) return rows[0];
  const existing = await getPool().query<Assignment>("SELECT * FROM duty_assignments WHERE duty_id=$1 AND student_id=$2", [dutyId, userId]);
  return existing.rows[0];
}

export async function removeAssignment(assignmentId: number): Promise<boolean> {
  const { rowCount } = await getPool().query("DELETE FROM duty_assignments WHERE id = $1", [assignmentId]);
  return (rowCount || 0) > 0;
}

export async function markAssignmentDone(assignmentId: number, actorId?: number): Promise<Assignment | null> {
  const { rows } = await getPool().query<Assignment>(
    `UPDATE duty_assignments SET status = 'done', completed_at = now(), completed_by = $2 WHERE id = $1 RETURNING *`,
    [assignmentId, actorId || null],
  );
  return rows[0] || null;
}

export async function markDutyComplete(dutyId: number): Promise<void> {
  await getPool().query("UPDATE duties SET status = 'completed', updated_at = now() WHERE id = $1", [dutyId]);
}

// Applications
export async function listApplications(viewer: DutyViewer, status?: AppStatus | "all"): Promise<Application[]> {
  const params: unknown[] = [];
  let where = `1=1`;
  if (viewer.role === "CSDL") {
    if (status && status !== "all") { params.push(status); where += ` AND a.status = $${params.length}`; }
  } else {
    params.push(viewer.id);
    where += ` AND a.applicant_id = $${params.length}`;
    if (status && status !== "all") { params.push(status); where += ` AND a.status = $${params.length}`; }
  }
  const { rows } = await getPool().query<Application>(
    `SELECT a.*, u.name as applicant_name, u.school_id as applicant_school_id, u.role as applicant_role
     FROM applications a JOIN users u ON u.id = a.applicant_id
     WHERE ${where} ORDER BY a.created_at DESC`,
    params,
  );
  return rows;
}

export async function createApplication(applicantId: number, data: { duty_id?: number | null; duty_title?: string; duty_area?: string; duty_date?: string; message?: string }): Promise<Application> {
  const { rows } = await getPool().query<Application>(
    `INSERT INTO applications (applicant_id, duty_id, duty_title, duty_area, duty_date, message)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [applicantId, data.duty_id || null, data.duty_title || null, data.duty_area || null, data.duty_date || null, data.message || null],
  );
  return rows[0];
}

export async function reviewApplication(appId: number, reviewerId: number, action: "approve" | "reject", note?: string): Promise<Application | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Application>("SELECT * FROM applications WHERE id = $1 FOR UPDATE", [appId]);
    const app = rows[0];
    if (!app) { await client.query("ROLLBACK"); return null; }
    const status = action === "approve" ? "approved" : "rejected";
    const { rows: updated } = await client.query<Application>(
      `UPDATE applications SET status = $2, reviewed_by = $3, review_note = $4, reviewed_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
      [appId, status, reviewerId, note || null],
    );
    if (action === "approve" && app.duty_id) {
      await client.query("INSERT INTO duty_assignments (duty_id, student_id, status) VALUES ($1,$2,'assigned') ON CONFLICT DO NOTHING", [app.duty_id, app.applicant_id]);
    }
    await client.query("COMMIT");
    // notify
    await createNotification(app.applicant_id, action === "approve" ? "application_approved" : "application_rejected",
      action === "approve" ? "Application Approved" : "Application Rejected",
      note ? `Your application was ${status}. Note: ${note}` : `Your application was ${status}.`,
      app.duty_id ? `/todays-assignments` : `/applications`
    );
    return updated[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Notifications
export async function createNotification(userId: number, type: NotificationType, title: string, message?: string | null, link?: string | null): Promise<Notification> {
  const { rows } = await getPool().query<Notification>(
    `INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [userId, type, title, message || null, link || null],
  );
  return rows[0];
}

export async function getNotifications(userId: number, unreadOnly = false): Promise<Notification[]> {
  const where = unreadOnly ? "user_id = $1 AND read = FALSE" : "user_id = $1";
  const { rows } = await getPool().query<Notification>(
    `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}

export async function markNotificationRead(id: number, userId: number): Promise<boolean> {
  const { rowCount } = await getPool().query("UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2", [id, userId]);
  return (rowCount || 0) > 0;
}

// Stats for monitor
export async function getCompletionStats(viewer: DutyViewer, filters: { from?: string; to?: string } = {}): Promise<{ total: number; completed: number; pending: number; overdue: number; rate: number }> {
  const params: unknown[] = [];
  const clauses: string[] = [scopeDuty(viewer, params)];
  if (filters.from) { params.push(`${filters.from}T00:00:00+08:00`); clauses.push(`d.start_time >= $${params.length}`); }
  if (filters.to) { params.push(`${filters.to}T23:59:59.999+08:00`); clauses.push(`d.start_time <= $${params.length}`); }
  const { rows } = await getPool().query(
    `SELECT 
       count(*)::int as total,
       count(*) FILTER (WHERE d.status = 'completed' OR EXISTS (SELECT 1 FROM duty_assignments da WHERE da.duty_id = d.id AND da.status IN ('done','completed')))::int as completed,
       count(*) FILTER (WHERE d.status = 'pending' OR (d.status != 'completed' AND EXISTS (SELECT 1 FROM duty_assignments da WHERE da.duty_id = d.id AND COALESCE(da.status,'assigned')='assigned')))::int as pending,
       count(*) FILTER (WHERE d.status != 'completed' AND d.start_time < now())::int as overdue
     FROM duties d WHERE ${clauses.join(" AND ")}`,
    params,
  );
  const r = rows[0] as any;
  const total = Number(r.total) || 0;
  const completed = Number(r.completed) || 0;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, pending: Number(r.pending) || 0, overdue: Number(r.overdue) || 0, rate };
}
