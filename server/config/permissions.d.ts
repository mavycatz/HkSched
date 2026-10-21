export declare const ROLES: Readonly<{
  STUDENT: "STUDENT";
  TEACHER: "TEACHER";
  CSDL: "CSDL";
}>;
export type Role = "STUDENT" | "TEACHER" | "CSDL";
export declare const PERMISSIONS: Readonly<Record<Role, readonly string[]>>;
export declare function can(role: string, key: string): boolean;
export declare function permissionsFor(role: string): string[];
