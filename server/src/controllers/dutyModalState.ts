/**
 * The state the duty modals need: which modal is open, what it holds and
 * which duty it acts on.
 *
 * Both the authoring page and the schedule browser show the same modals, so
 * they read their state from here and can never drift apart.
 */
import {
  getDuty,
  listAssignableUsers,
  listDutyAssignments,
  listDutyLocations,
  type DutyLocation,
  type DutyRecord,
  type AssignableUser,
} from "../services/dutyService";
import { toInputValue } from "../lib/time";

/** The values the create and edit forms hold. */
export interface DutyFormValues {
  id: number | null;
  title: string;
  description: string;
  class_group: string;
  start_time: string;
  end_time: string;
  location_id: number | null;
  location_name: string;
  requires_exclusive_location: boolean;
  assigned_to: number | null;
}

export interface DutyModalState {
  /** What the create form holds. */
  createForm: DutyFormValues;
  /** What the edit form holds; null when no schedule is being edited. */
  editForm: DutyFormValues | null;
  createOpen: boolean;
  editOpen: boolean;
  dutyFormErrors: Record<string, string>;
  dutyConflicts: { message: string }[];
  assignDutyId: number;
  assignStudents: { id: number; name: string; student_id: string }[];
  assignTeacherId: number | null;
  assignTeacherName: string;
  dutyAssignStudentsOpen: boolean;
  dutyAssignTeacherOpen: boolean;
  locations: DutyLocation[];
  teachers: AssignableUser[];
}

/** A number from the query string, or null when it is not one. */
function queryNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** The empty form the create modal starts with. */
function emptyForm(): DutyFormValues {
  return {
    id: null,
    title: "",
    description: "",
    class_group: "",
    start_time: "",
    end_time: "",
    location_id: null,
    location_name: "",
    requires_exclusive_location: false,
    assigned_to: null,
  };
}

/** The form that holds a duty's own details. */
function formOf(duty: DutyRecord): DutyFormValues {
  return {
    id: duty.id,
    title: duty.title || "",
    description: duty.description || "",
    class_group: duty.class_group || "",
    start_time: toInputValue(duty.start_time),
    end_time: toInputValue(duty.end_time),
    location_id: duty.location_id,
    location_name: duty.location_name || "",
    requires_exclusive_location: Boolean(duty.requires_exclusive_location),
    assigned_to: duty.assignee_id,
  };
}

/**
 * Read the modal state from the address. `?create=1` opens the create modal,
 * `?edit=<id>` the edit modal, `?assign=<id>` the assign-students modal and
 * `?assign_teacher=<id>` the assign-teacher modal.
 */
export async function readDutyModalState(
  query: Record<string, unknown>,
  overrides: {
    createForm?: DutyFormValues;
    editForm?: DutyFormValues | null;
    createOpen?: boolean;
    editOpen?: boolean;
    dutyFormErrors?: Record<string, string>;
    conflicts?: { message: string }[];
  } = {},
): Promise<DutyModalState> {
  const [locations, teachers] = await Promise.all([
    listDutyLocations({}),
    listAssignableUsers("TEACHER"),
  ]);

  const editId = queryNumber(query.edit);
  const assignId = queryNumber(query.assign);
  const teacherDutyId = queryNumber(query.assign_teacher);
  const create = query.create === "1" || query.create === "true";

  const editDuty = editId ? await getDuty(editId) : null;
  const assignDuty = assignId ? await getDuty(assignId) : null;
  const teacherDuty = teacherDutyId ? await getDuty(teacherDutyId) : null;

  const studentsOf = async (duty: DutyRecord | null) => {
    if (!duty) return [];
    const rows = await listDutyAssignments(duty.id);
    return rows.map((row) => ({
      id: row.student_id,
      name: row.student_name ?? "",
      student_id: row.student_school_id ?? "",
    }));
  };

  const assignStudents = await studentsOf(assignDuty);
  const teacherDutyStudents = await studentsOf(teacherDuty);

  const editForm = overrides.editForm !== undefined
    ? overrides.editForm
    : editDuty
      ? formOf(editDuty)
      : null;

  return {
    createForm: overrides.createForm ?? emptyForm(),
    editForm,
    createOpen: overrides.createOpen ?? create,
    editOpen: overrides.editOpen ?? Boolean(editDuty),
    dutyFormErrors: overrides.dutyFormErrors ?? {},
    dutyConflicts: overrides.conflicts ?? [],
    assignDutyId: assignDuty ? assignDuty.id : teacherDuty ? teacherDuty.id : 0,
    assignStudents: assignDuty ? assignStudents : teacherDutyStudents,
    assignTeacherId: teacherDuty ? teacherDuty.assignee_id : assignDuty ? assignDuty.assignee_id : null,
    assignTeacherName: teacherDuty
      ? teacherDuty.assignee_name || ""
      : assignDuty
        ? assignDuty.assignee_name || ""
        : "",
    dutyAssignStudentsOpen: Boolean(assignDuty),
    dutyAssignTeacherOpen: Boolean(teacherDuty),
    locations,
    teachers,
  };
}
