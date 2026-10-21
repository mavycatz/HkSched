import session from "express-session";
import type { RequestHandler } from "express";
import connectPgSimple from "connect-pg-simple";
import { getPool } from "../db/pool";
import { isProd, sessionSecret } from "./env";

export const SESSION_COOKIE_NAME = "hkduty.sid";
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

export function sessionMiddleware(): RequestHandler {
  const PgStore = connectPgSimple(session);
  return session({
    name: SESSION_COOKIE_NAME,
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    store: new PgStore({
      pool: getPool(),
      createTableIfMissing: false,
      tableName: "session",
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd(),
      maxAge: SESSION_MAX_AGE_MS,
    },
  });
}
