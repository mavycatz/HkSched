/**
 * The duty module's JSON endpoints: the location catalogue, the Student ID
 * search and the conflict preview the modals use.
 *
 * Every one of them reads from the duty service, so the rules that decide a
 * clash or a duplicate live in exactly one place.
 */
import type { Request, Response, NextFunction } from "express";
import {
  DuplicateLocationError,
  ForbiddenError,
  ValidationError,
  createDutyLocation,
  describeConflict,
  detectConflicts,
  listDutyLocations,
  searchStudents,
  type DutyConflict,
  type DutyLocationKind,
} from "../services/dutyService";
import { manilaMoment } from "../lib/time";

/** A number from a request body, or null when it is empty. */
function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The ids of the students a request names. */
function studentIds(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return raw
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
}

/** How a conflict is described to the page that asked for it. */
interface ConflictSummary {
  kind: "student" | "teacher" | "location";
  name: string;
  detail: string | null;
  dutyId: number;
  dutyTitle: string;
  startTime: string;
  endTime: string | null;
  message: string;
}

function summarise(conflict: DutyConflict): ConflictSummary {
  return {
    kind: conflict.kind,
    name: conflict.name,
    detail: conflict.detail ?? null,
    dutyId: conflict.dutyId,
    dutyTitle: conflict.dutyTitle,
    startTime: new Date(conflict.startTime).toISOString(),
    endTime: conflict.endTime ? new Date(conflict.endTime).toISOString() : null,
    message: describeConflict(conflict),
  };
}

/** The locations of the catalogue, narrowed by a search term. */
export async function getDutyLocations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const search = typeof req.query.q === "string" ? req.query.q : null;
    const locations = await listDutyLocations({ activeOnly: true, search });
    res.json({
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        kind: location.kind,
        building: location.building,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/** Add a location to the catalogue. */
export async function postDutyLocation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const kind = String(body.kind ?? "") as DutyLocationKind;
    const building = String(body.building ?? "").trim() || null;

    const location = await createDutyLocation({ name, kind, building });
    res.status(201).json({
      location: {
        id: location.id,
        name: location.name,
        kind: location.kind,
        building: location.building,
      },
    });
  } catch (error) {
    if (error instanceof DuplicateLocationError) {
      res.status(409).json({
        error: error.message,
        location: {
          id: error.location.id,
          name: error.location.name,
          kind: error.location.kind,
          building: error.location.building,
        },
      });
      return;
    }
    if (error instanceof ValidationError) {
      res.status(422).json({ error: error.message, fieldErrors: error.fieldErrors });
      return;
    }
    next(error);
  }
}

/** Find students by their Student ID. */
export async function getStudentSearch(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const students = await searchStudents(query);
    res.json({
      students: students.map((student) => ({
        id: student.id,
        name: student.name,
        student_id: student.student_id,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * The clashes a proposed schedule would create. The modals call this as the
 * staff member fills the form in, so the reason is shown before the save is
 * attempted; the server checks again when the write arrives.
 */
export async function postConflictPreview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const start = manilaMoment(body.start_time ?? body.startTime);
    const end = manilaMoment(body.end_time ?? body.endTime);
    if (!start) {
      res.status(422).json({ error: "A schedule needs a start time.", fieldErrors: { start_time: "A schedule needs a start time." } });
      return;
    }
    const conflicts = await detectConflicts({
      dutyId: optionalNumber(body.duty_id ?? body.dutyId),
      startTime: start,
      endTime: end,
      locationId: optionalNumber(body.location_id ?? body.locationId),
      requiresExclusiveLocation: Boolean(body.requires_exclusive_location ?? body.requiresExclusiveLocation),
      studentIds: studentIds(body.student_ids ?? body.studentIds),
      teacherId: optionalNumber(body.assigned_to ?? body.assignedTo),
    });
    res.json({ conflicts: conflicts.map(summarise) });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      res.status(403).json({ error: error.message });
      return;
    }
    next(error);
  }
}
