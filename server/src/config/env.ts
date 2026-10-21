import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (isProd()) {
    throw new Error("SESSION_SECRET must be set to a value of 16+ characters in production");
  }
  return "dev-only-session-secret-change-me";
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function port(): number {
  return Number(process.env.PORT || 3000);
}
