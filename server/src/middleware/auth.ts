import type { Request, Response, NextFunction } from "express";
import { can } from "../../config/permissions";
import { navFor } from "../config/navigation";
import { findUserById } from "../lib/users";
import { audit } from "../lib/audit";
import { csrfToken } from "../lib/csrf";

export interface AuthUser {
  id: number;
  school_id: string;
  full_name: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "CSDL";
  is_active: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Re-read the user (including role) from the DB for the session's user id on every request. */
export function loadUser(req: Request, res: Response, next: NextFunction): void {
  const userId = req.session?.userId;
  if (!userId) {
    next();
    return;
  }
  findUserById(userId)
    .then((row) => {
      if (row && row.is_active) {
        const { password_hash: _ignored, ...user } = row;
        req.user = user;
        next();
      } else {
        // Inactive or deleted account: drop the session and send to login.
        req.session.destroy(() => res.redirect("/login"));
      }
    })
    .catch(next);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.redirect("/login");
    return;
  }
  next();
}

/** Shell locals for the themed status page (works signed in or out). */
export function statusLocals(req: Request, res: Response) {
  const user = req.user;
  return {
    user,
    nav: user ? navFor(user.role) : [],
    csrfToken: csrfToken(req, res),
  };
}

export function requirePermission(key: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.redirect("/login");
      return;
    }
    if (!can(user.role, key)) {
      void audit("permission_denied", req, user.id, { permission: key });
      res.status(403).render("status", {
        ...statusLocals(req, res),
        code: 403,
        message: "You don't have access to this page.",
        title: "Access denied",
      });
      return;
    }
    next();
  };
}

/** Ensures the session user has the exact role. Used for role-scoped routes. */
export function requireRole(role: "STUDENT" | "TEACHER" | "CSDL") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.redirect("/login");
      return;
    }
    if (user.role !== role) {
      void audit("permission_denied", req, user.id, { permission: `role:${role}` });
      res.status(403).render("status", {
        ...statusLocals(req, res),
        code: 403,
        message: "You don't have access to this page.",
        title: "Access denied",
      });
      return;
    }
    next();
  };
}
