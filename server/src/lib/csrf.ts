import { doubleCsrf } from "csrf-csrf";
import type { Request, Response, NextFunction } from "express";
import { isProd, sessionSecret } from "../config/env";

export const CSRF_COOKIE_NAME = isProd() ? "__Host-hkduty-csrf" : "hkduty-csrf";

const cookieOptions = {
  sameSite: "lax" as const,
  path: "/",
  secure: isProd(),
  httpOnly: true,
};

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => sessionSecret(),
  getSessionIdentifier: (req) => req.sessionID,
  cookieName: CSRF_COOKIE_NAME,
  cookieOptions,
  getCsrfTokenFromRequest: (req) => {
    const body = req.body as Record<string, unknown> | undefined;
    return typeof body?._csrf === "string" ? body._csrf : undefined;
  },
});

export function csrfToken(req: Request, res: Response): string {
  const token = generateCsrfToken(req, res);
  // The token is bound to the session id; persist anonymous sessions that mint
  // tokens so the id survives from the form render (GET) to the submit (POST).
  if (req.session && !req.session.userId && !req.session.csrfAnchor) {
    req.session.csrfAnchor = true;
  }
  return token;
}

/** Drop the CSRF cookie so a fresh token is minted bound to the next request's session. */
export function clearCsrfCookie(res: Response): void {
  res.clearCookie(CSRF_COOKIE_NAME, cookieOptions);
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  void doubleCsrfProtection(req, res, next);
}
