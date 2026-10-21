import express from "express";
import path from "path";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { sessionMiddleware } from "./config/session";
import { csrfProtection } from "./lib/csrf";
import { loadUser } from "./middleware/auth";
import { getPool } from "./db/pool";
import routes from "./routes";

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", 1);
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          fontSrc: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(express.json({ limit: "64kb" }));

  app.use(sessionMiddleware());
  app.use(cookieParser());
  app.use(csrfProtection);

  app.get("/health", async (_req, res) => {
    try {
      await getPool().query("SELECT 1");
      res.status(200).json({ status: "up" });
    } catch {
      res.status(503).json({ status: "down" });
    }
  });

  app.use(loadUser);

  app.use("/", routes);

  app.use((_req, res) => {
    res.status(404).render("status", {
      code: 404,
      message: "This page could not be found.",
      title: "Page not found",
    });
  });

  app.use(
    (
      err: { statusCode?: number; status?: number; message?: string },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      const status = Number(err.statusCode || err.status || 500);
      if (status >= 500) {
        console.error(`[error] ${status} ${err.message}`);
      }
      res.status(status).render("status", {
        code: status,
        message:
          status === 403
            ? "This request could not be verified. Please go back and try again."
            : status >= 500
              ? "Something went wrong on our end. Please try again."
              : err.message || "Request failed",
        title: status >= 500 ? "Server error" : "Request failed",
      });
    },
  );

  return app;
}
