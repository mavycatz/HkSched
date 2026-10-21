import { can, type Role } from "../../config/permissions";

export interface NavItem {
  path: string;
  label: string;
  permission: string;
}

/**
 * Sidebar items per role (label sets fixed by the access-control spec).
 * Logout is rendered separately as a POST form in the sidebar footer.
 */
export const NAV_ITEMS: Record<Role, NavItem[]> = {
  STUDENT: [
    { path: "/dashboard", label: "Dashboard", permission: "dashboard.view" },
    { path: "/my-duties", label: "My Duties", permission: "duties.own.view" },
    { path: "/upcoming-duties", label: "Upcoming Duties", permission: "duties.upcoming.view" },
    { path: "/schedule", label: "Schedule", permission: "schedule.own.view" },
    { path: "/attendance-profile", label: "Attendance Profile", permission: "attendance.own.view" },
    { path: "/applications", label: "Applications", permission: "applications.own.view" },
    { path: "/profile", label: "Profile", permission: "profile.own" },
    { path: "/settings", label: "Settings", permission: "settings.manage" },
  ],
  TEACHER: [
    { path: "/dashboard", label: "Dashboard", permission: "dashboard.view" },
    { path: "/todays-assignments", label: "Today's Assignments", permission: "assignments.today.view" },
    { path: "/assignments", label: "Assignments", permission: "assignments.manage" },
    { path: "/verification", label: "Verification", permission: "duty.verify" },
    { path: "/approvals", label: "Approvals", permission: "approvals.review" },
    { path: "/my-schedule", label: "My Schedule", permission: "schedule.own.view" },
    { path: "/applications", label: "Applications", permission: "applications.own.view" },
    { path: "/profile", label: "Profile", permission: "profile.own" },
    { path: "/settings", label: "Settings", permission: "settings.manage" },
  ],
  CSDL: [
    { path: "/dashboard", label: "Dashboard", permission: "dashboard.view" },
    { path: "/todays-assignments", label: "Today's Assignments", permission: "assignments.today.view" },
    { path: "/duty-schedules", label: "Duty Schedules", permission: "schedules.view" },
    { path: "/create-edit-schedule", label: "Create/Edit Schedule", permission: "schedules.manage" },
    { path: "/assign-students-teachers", label: "Assign Students & Teachers", permission: "assign.students_teachers" },
    { path: "/monitor-completion", label: "Monitor Completion", permission: "completion.monitor" },
    { path: "/applications", label: "Applications", permission: "applications.manage" },
    { path: "/profile-settings", label: "Profile & Settings", permission: "settings.manage" },
  ],
};

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS[role].filter((item) => can(role, item.permission));
}
