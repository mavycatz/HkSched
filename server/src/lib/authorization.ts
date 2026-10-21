import type { AuthUser } from "../middleware/auth";

/**
 * Record-level (row-level) authorization skeleton.
 *
 * Rules by role:
 * - STUDENT: own records only (matched on school_id).
 * - TEACHER: own assignments, supervised students, and applications routed to
 *   them — the supervised-student set is injected by the data layer once
 *   assignments exist (default: empty, so nothing is visible yet).
 * - CSDL: full visibility.
 *
 * Out-of-scope records are treated as NONEXISTENT (404), never as a
 * permission failure (403), so unauthorized users cannot confirm that a
 * record exists.
 */

export type SupervisedStudentsProvider = (
  teacher: AuthUser,
) => Set<string> | Promise<Set<string>>;

let supervisedStudentsProvider: SupervisedStudentsProvider = () => new Set<string>();

/** Hook for the future assignments data layer. */
export function setSupervisedStudentsProvider(provider: SupervisedStudentsProvider): void {
  supervisedStudentsProvider = provider;
}

export async function canViewStudentRecord(
  viewer: AuthUser,
  targetSchoolId: string,
): Promise<boolean> {
  if (viewer.role === "CSDL") return true;
  if (viewer.role === "STUDENT") return viewer.school_id === targetSchoolId;
  const supervised = await supervisedStudentsProvider(viewer);
  return supervised.has(targetSchoolId);
}

export function sendNotFound(res: import("express").Response): void {
  res.status(404).render("status", {
    code: 404,
    message: "This page could not be found.",
    title: "Page not found",
  });
}
