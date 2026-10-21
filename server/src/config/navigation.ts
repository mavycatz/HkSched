import { can, type Role } from "../../config/permissions";

export interface NavItem {
  path: string;
  label: string;
  permission: string;
  /** Key of the icon rendered in the sidebar (see views/partials/sidebar.ejs). */
  icon: string;
}

/**
 * Sidebar items per role (label sets fixed by the access-control spec).
 * Logout is rendered separately as a POST form in the sidebar footer.
 */
export const NAV_ITEMS: Record<Role, NavItem[]> = {
  STUDENT: [
    { path: "/dashboard", label: "Dashboard", permission: "dashboard.view", icon: "home" },
    { path: "/my-duties", label: "My Duties", permission: "duties.own.view", icon: "calendar" },
    { path: "/upcoming-duties", label: "Upcoming Duties", permission: "duties.upcoming.view", icon: "schedule" },
    { path: "/schedule", label: "Schedule", permission: "schedule.own.view", icon: "calendar" },
    { path: "/attendance-profile", label: "Attendance Profile", permission: "attendance.own.view", icon: "monitor" },
    { path: "/applications", label: "Applications", permission: "applications.own.view", icon: "file" },
    { path: "/profile", label: "Profile", permission: "profile.own", icon: "user" },
    { path: "/settings", label: "Settings", permission: "settings.manage", icon: "settings" },
  ],
  TEACHER: [
    { path: "/dashboard", label: "Dashboard", permission: "dashboard.view", icon: "home" },
    { path: "/todays-assignments", label: "Today's Assignments", permission: "assignments.today.view", icon: "calendar" },
    { path: "/assignments", label: "Assignments", permission: "assignments.manage", icon: "file" },
    { path: "/verification", label: "Verification", permission: "duty.verify", icon: "check" },
    { path: "/approvals", label: "Approvals", permission: "approvals.review", icon: "file" },
    { path: "/my-schedule", label: "My Schedule", permission: "schedule.own.view", icon: "calendar" },
    { path: "/applications", label: "Applications", permission: "applications.own.view", icon: "file" },
    { path: "/profile", label: "Profile", permission: "profile.own", icon: "user" },
    { path: "/settings", label: "Settings", permission: "settings.manage", icon: "settings" },
  ],
  CSDL: [
    { path: "/csdl/dashboard", label: "Dashboard", permission: "dashboard.view", icon: "home" },
    { path: "/todays-assignments", label: "Today's Assignments", permission: "assignments.today.view", icon: "calendar" },
    { path: "/csdl/schedule", label: "Duty Schedules", permission: "schedules.view", icon: "calendar" },
    { path: "/csdl/duty-management", label: "Create/Edit Schedule", permission: "schedules.manage", icon: "edit" },
    { path: "/assign-students-teachers", label: "Assign Students/Teachers", permission: "assign.students_teachers", icon: "users" },
    { path: "/monitor-completion", label: "Monitor Completion", permission: "completion.monitor", icon: "monitor" },
    { path: "/csdl/applications", label: "Applications", permission: "applications.manage", icon: "file" },
    { path: "/csdl/profile", label: "Profile & Settings", permission: "settings.manage", icon: "user" },
  ],
};

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS[role].filter((item) => can(role, item.permission));
}
