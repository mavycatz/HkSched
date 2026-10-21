/**
 * Profile view model.
 *
 * The profile page shows the signed-in user's own record plus a catalogue of
 * the notification preferences the application knows about. The preferences are
 * a catalogue only — nothing about them is stored, and this service never
 * writes to the database.
 */
import { findUserById, type UserRecord } from "../lib/users";

export interface ProfileNotification {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface ProfileViewModel {
  schoolId: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  initials: string;
  notifications: ProfileNotification[];
}

const ROLE_LABELS: Record<UserRecord["role"], string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  CSDL: "CSDL Staff",
};

/**
 * The catalogue of notification preferences. These are not persisted in this
 * release; the section is shown so the preferences are visible and labelled.
 */
export const NOTIFICATION_PREFERENCES: ProfileNotification[] = [
  {
    id: "duty_reminders",
    label: "Duty reminders",
    description: "A reminder before each of your duties begins.",
    enabled: true,
  },
  {
    id: "schedule_changes",
    label: "Schedule changes",
    description: "Notice when a duty is rescheduled or reassigned.",
    enabled: true,
  },
  {
    id: "announcements",
    label: "School announcements",
    description: "Announcements from the CSDL office.",
    enabled: false,
  },
];

/** The initials shown in the profile avatar. */
export function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The view model for the signed-in user, or null when the user is gone. */
export async function getProfileViewModel(userId: number): Promise<ProfileViewModel | null> {
  const user = await findUserById(userId);
  if (!user) return null;
  return {
    schoolId: user.school_id,
    name: user.full_name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    initials: initialsFor(user.full_name),
    notifications: NOTIFICATION_PREFERENCES,
  };
}
