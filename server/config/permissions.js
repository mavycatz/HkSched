/**
 * SINGLE SOURCE OF TRUTH for roles and permissions.
 * Nothing else may define permission sets; navigation and route guards
 * are generated from this map.
 */

const ROLES = Object.freeze({
  STUDENT: "STUDENT",
  TEACHER: "TEACHER",
  CSDL: "CSDL",
});

const PERMISSIONS = Object.freeze({
  STUDENT: Object.freeze([
    "dashboard.view",
    "duties.upcoming.view",
    "duties.own.view",
    "duties.details.view",
    "schedule.own.view",
    "attendance.own.view",
    "applications.submit",
    "applications.own.view",
    "settings.manage",
    "profile.own",
  ]),
  TEACHER: Object.freeze([
    "dashboard.view",
    "assignments.today.view",
    "assignments.manage",
    "completion.record",
    "duty.verify",
    "approvals.review",
    "schedule.own.view",
    "applications.submit",
    "applications.own.view",
    "settings.manage",
    "profile.own",
  ]),
  CSDL: Object.freeze([
    "dashboard.view",
    "assignments.today.view",
    "schedules.view",
    "schedules.manage",
    "assign.students_teachers",
    "locations.manage",
    "completion.record",
    "completion.monitor",
    "applications.manage",
    "profile.own",
    "settings.manage",
  ]),
});

/** @param {string} role @param {string} key */
function can(role, key) {
  const set = PERMISSIONS[role];
  return Array.isArray(set) && set.includes(key);
}

/** @param {string} role @returns {string[]} */
function permissionsFor(role) {
  return [...(PERMISSIONS[role] || [])];
}

module.exports = { ROLES, PERMISSIONS, can, permissionsFor };
