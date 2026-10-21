import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { isProd } from "../config/env";
import { clearCsrfCookie, csrfToken } from "../lib/csrf";
import { audit } from "../lib/audit";
import { verifyPassword } from "../lib/password";
import { findUserByIdentifier } from "../lib/users";
import { SESSION_COOKIE_NAME } from "../config/session";

export const REMEMBER_COOKIE_NAME = "remember_id";
export const REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  remember: z.string().optional(),
});

export function readRememberedId(req: Request): string {
  const value = req.cookies?.[REMEMBER_COOKIE_NAME];
  return typeof value === "string" && value.length <= 128 ? value : "";
}

interface LoginViewLocals {
  error: string | null;
  fieldErrors: { identifier?: string[]; password?: string[] } | null;
  identifier: string;
  csrfToken: string;
}

function renderLogin(
  req: Request,
  res: Response,
  status: number,
  locals: Partial<LoginViewLocals>,
): void {
  res.status(status).render("login", {
    error: null,
    fieldErrors: null,
    identifier: locals.identifier ?? readRememberedId(req),
    ...locals,
    csrfToken: csrfToken(req, res),
  } satisfies LoginViewLocals);
}

export function getLogin(req: Request, res: Response): void {
  renderLogin(req, res, 200, {});
}

export async function postLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      renderLogin(req, res, 422, {
        fieldErrors: {
          identifier: flat.identifier,
          password: flat.password,
        },
        identifier: String(req.body?.identifier ?? ""),
      });
      return;
    }

    const { identifier, password, remember } = parsed.data;
    const user = await findUserByIdentifier(identifier);
    const passwordOk =
      user && user.is_active ? await verifyPassword(user.password_hash, password) : false;

    if (!user || !user.is_active || !passwordOk) {
      await audit("login_failure", req, user?.id ?? null, { identifier });
      renderLogin(req, res, 401, {
        error: "Invalid credentials",
        identifier,
      });
      return;
    }

    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );
    await audit("login_success", req, user.id, { role: user.role });

    if (remember === "on" || remember === "true") {
      res.cookie(REMEMBER_COOKIE_NAME, identifier, {
        httpOnly: false,
        sameSite: "lax",
        secure: isProd(),
        maxAge: REMEMBER_MAX_AGE_MS,
        path: "/",
      });
    } else {
      res.clearCookie(REMEMBER_COOKIE_NAME, { path: "/" });
    }
    clearCsrfCookie(res);
    res.redirect("/dashboard");
  } catch (err) {
    next(err);
  }
}

export async function postLogout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.session?.userId ?? null;
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve())),
    );
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.clearCookie(REMEMBER_COOKIE_NAME, { path: "/" });
    clearCsrfCookie(res);
    await audit("logout", req, userId);
    res.redirect("/login");
  } catch (err) {
    next(err);
  }
}
