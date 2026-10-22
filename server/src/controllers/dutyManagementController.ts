/**
 * Duty Schedule Management — the authoring page at `/csdl/duty-management`.
 *
 * The page creates and edits schedules and keeps the location catalogue; the
 * list of every schedule lives on the Duty Schedules page. Everything is
 * rendered on the server, so the modals hold what was entered even when the
 * save was refused, and the write itself is refused again by the server.
 */
import type { Request, Response, NextFunction } from "express";
import { navFor } from "../config/navigation";
import { csrfToken } from "../lib/csrf";
import { can } from "../../config/permissions";
import {
  ConflictError,
  DuplicateLocationError,
  ValidationError,
  assignDuty,
  cancelDuty,
  createDuty,
  createDutyLocation,
  deleteDuty,
  describeConflict,
  dutyStatusView,
  updateDuty,
  type DutyLocationKind,
} from "../services/dutyService";
import { readDutyModalState, type DutyFormValues } from "./dutyModalState";
import { manilaTimestamp } from "../lib/time";

/** The address of the authoring page. */
export const AUTHORING_PATH = "/csdl/duty-management";

function shellLocals(req: Request, res: Response) {
  const user = req.user;
  return { user, nav: user ? navFor(user.role) : [], csrfToken: csrfToken(req, res) };
}

/** A number from a form field, or null when the field is empty. */
function optionalNumber(value: unknown): number | null {
  if (Array.isArray(value)) {
    // The location field posts both its hidden value and, without the
    // script, the select beside it. The first number among them is the one
    // that was chosen.
    for (const entry of value) {
      const parsed = optionalNumber(entry);
      if (parsed !== null) return parsed;
    }
    return null;
  }
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The address the page returns to after a write. Only a path inside this
 * site is followed, so the address can never point somewhere else.
 */
function returnTo(body: Record<string, unknown>): string {
  const raw = typeof body.return_to === "string" ? body.return_to : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : AUTHORING_PATH;
}

/** The address of a page, with the notice the page shows on arrival. */
function withMessage(path: string, message: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}msg=${encodeURIComponent(message)}`;
}

/** The values a form holds, read back from what was posted. */
function formFromBody(body: Record<string, unknown>): DutyFormValues {
  return {
    id: optionalNumber(body.id),
    title: String(body.title ?? "").trim(),
    description: String(body.description ?? "").trim(),
    class_group: String(body.class_group ?? "").trim(),
    start_time: String(body.start_time ?? ""),
    end_time: String(body.end_time ?? ""),
    location_id: optionalNumber(body.location_id),
    location_name: "",
    requires_exclusive_location: Boolean(body.requires_exclusive_location),
    assigned_to: optionalNumber(body.assigned_to),
  };
}

/** What the page shows when a write is refused. */
interface AuthoringOptions {
  message?: string | null;
  locationNotice?: { kind: "added" | "duplicate"; name?: string | null } | null;
  createForm?: DutyFormValues;
  editForm?: DutyFormValues | null;
  createOpen?: boolean;
  editOpen?: boolean;
  dutyFormErrors?: Record<string, string>;
  dutyConflicts?: { message: string }[];
  dutyAssignStudentsOpen?: boolean;
  dutyAssignTeacherOpen?: boolean;
  status?: number;
}

/** The authoring page: the create action, the location catalogue and the modals. */
async function renderAuthoring(
  req: Request,
  res: Response,
  options: AuthoringOptions = {},
): Promise<void> {
  const base = await readDutyModalState(req.query as Record<string, unknown>, {
    createForm: options.createForm,
    editForm: options.editForm,
    createOpen: options.createOpen,
    editOpen: options.editOpen,
    dutyFormErrors: options.dutyFormErrors,
    conflicts: options.dutyConflicts,
  });

  const message =
    options.message ?? (typeof req.query.msg === "string" ? req.query.msg : null);

  res.status(options.status ?? 200).render("pages/duty-management", {
    ...shellLocals(req, res),
    title: "Duty Management",
    activePath: "/csdl/duty-management",
    bodyClass: "app-page",
    pageStyles: ["pages", "duty-management", "components"],
    pageScripts: ["duty-management"],
    statusView: dutyStatusView,
    canManageLocations: can(req.user!.role, "locations.manage"),
    message,
    locationNotice: options.locationNotice ?? null,
    // The catalogue and the modal selectors read the same location list.
    ...base,
    dutyAssignStudentsOpen: options.dutyAssignStudentsOpen ?? base.dutyAssignStudentsOpen,
    dutyAssignTeacherOpen: options.dutyAssignTeacherOpen ?? base.dutyAssignTeacherOpen,
    returnTo: AUTHORING_PATH,
  });
}

/** The authoring page. */
export async function getDutyManagement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await renderAuthoring(req, res);
  } catch (error) {
    next(error);
  }
}

/** Create a schedule from the create form. */
export async function postCreateDuty(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const values = formFromBody(body);

    try {
      await createDuty(
        {
          title: values.title,
          locationId: values.location_id ?? 0,
          description: values.description || null,
          startTime: manilaTimestamp(body.start_time) ?? "",
          endTime: manilaTimestamp(body.end_time) ?? null,
          assignedTo: values.assigned_to,
          classGroup: values.class_group || null,
          requiresExclusiveLocation: values.requires_exclusive_location,
        },
        req.user!.id,
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        await renderAuthoring(req, res, {
          status: 422,
          createForm: values,
          createOpen: true,
          dutyFormErrors: error.fieldErrors,
        });
        return;
      }
      if (error instanceof ConflictError) {
        await renderAuthoring(req, res, {
          status: 409,
          createForm: values,
          createOpen: true,
          dutyFormErrors: { conflict: "This schedule clashes with one that already exists." },
          dutyConflicts: error.conflicts.map((conflict) => ({ message: describeConflict(conflict) })),
        });
        return;
      }
      throw error;
    }

    res.redirect(303, withMessage(returnTo(body), "created"));
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
    const id = optionalNumber(req.params.id ?? body.id);
    if (!id) {
      res.status(404).render("status", {
        ...shellLocals(req, res),
        code: 404,
        title: "Schedule not found",
        message: "That schedule no longer exists.",
      });
      return;
    }
    const values = formFromBody(body);

    try {
      await updateDuty(id, {
        title: values.title,
        locationId: values.location_id ?? 0,
        description: values.description || null,
        startTime: manilaTimestamp(body.start_time) ?? "",
        endTime: manilaTimestamp(body.end_time) ?? null,
        assignedTo: values.assigned_to,
        classGroup: values.class_group || null,
        requiresExclusiveLocation: values.requires_exclusive_location,
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        await renderAuthoring(req, res, {
          status: 422,
          editForm: values,
          editOpen: true,
          dutyFormErrors: error.fieldErrors,
        });
        return;
      }
      if (error instanceof ConflictError) {
        await renderAuthoring(req, res, {
          status: 409,
          editForm: values,
          editOpen: true,
          dutyFormErrors: { conflict: "This schedule clashes with one that already exists." },
          dutyConflicts: error.conflicts.map((conflict) => ({ message: describeConflict(conflict) })),
        });
        return;
      }
      throw error;
    }

    res.redirect(303, withMessage(returnTo(body), "updated"));
  } catch (error) {
    next(error);
  }
}

/** Delete a schedule. */
export async function postDeleteDuty(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const id = optionalNumber(req.params.id ?? body.id);
    if (id) {
      await deleteDuty(id);
    }
    res.redirect(303, withMessage(returnTo(body), "deleted"));
  } catch (error) {
    next(error);
  }
}

/** Cancel a schedule, keeping it readable. */
export async function postCancelDuty(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const id = optionalNumber(req.params.id ?? body.id);
    if (id) {
      await cancelDuty(id);
    }
    res.redirect(303, withMessage(returnTo(body), "cancelled"));
  } catch (error) {
    next(error);
  }
}

/** Add a location to the catalogue from the page's own form. */
export async function postCreateLocation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const kind = String(body.kind ?? "") as DutyLocationKind;
    const building = String(body.building ?? "").trim() || null;

    try {
      await createDutyLocation({ name, kind, building });
    } catch (error) {
      if (error instanceof DuplicateLocationError) {
        await renderAuthoring(req, res, {
          status: 409,
          locationNotice: { kind: "duplicate", name: error.location.name },
        });
        return;
      }
      if (error instanceof ValidationError) {
        await renderAuthoring(req, res, {
          status: 422,
          locationNotice: { kind: "duplicate", name: name || null },
        });
        return;
      }
      throw error;
    }

    res.redirect(303, withMessage(AUTHORING_PATH, "location-added"));
  } catch (error) {
    next(error);
  }
}

/** The ids of the students a form posted. */
function postedStudentIds(body: Record<string, unknown>): number[] {
  const raw = body.student_ids;
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

/**
 * Save the students and the supervising teacher of a schedule. The write is
 * refused when the same student is named twice or when the change would
 * double-book a student, the teacher or an exclusive location.
 */
export async function postAssignDuty(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const id = optionalNumber(req.params.id ?? body.id);
    if (!id) {
      res.status(404).render("status", {
        ...shellLocals(req, res),
        code: 404,
        title: "Schedule not found",
        message: "That schedule no longer exists.",
      });
      return;
    }

    const studentIds = postedStudentIds(body);
    const teacherId = optionalNumber(body.assigned_to);

    // The two modals each carry one half of the assignment: only the half
    // that was posted is changed, the other half is left as it was.
    const write: Parameters<typeof assignDuty>[1] = {
      studentIds: body.student_ids === undefined ? undefined : studentIds,
      teacherId: body.assigned_to === undefined ? undefined : teacherId,
    };

    try {
      await assignDuty(id, write);
    } catch (error) {
      if (error instanceof ValidationError) {
        await renderAuthoring(req, res, {
          status: 422,
          dutyFormErrors: error.fieldErrors,
          dutyAssignStudentsOpen: true,
        });
        return;
      }
      if (error instanceof ConflictError) {
        await renderAuthoring(req, res, {
          status: 409,
          dutyFormErrors: { conflict: "These assignments clash with one that already exists." },
          dutyConflicts: error.conflicts.map((conflict) => ({ message: describeConflict(conflict) })),
          dutyAssignStudentsOpen: true,
        });
        return;
      }
      throw error;
    }

    res.redirect(303, withMessage(returnTo(body), "assigned"));
  } catch (error) {
    next(error);
  }
}
