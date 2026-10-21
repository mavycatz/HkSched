import { execSync } from "child_process";
import path from "path";
import dotenv from "dotenv";

export default function globalSetup(): void {
  dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
  dotenv.config({ path: path.join(__dirname, "..", ".env") });

  // Run all tests against the test database.
  const testUrl = process.env.DATABASE_TEST_URL;
  if (!testUrl) {
    throw new Error("DATABASE_TEST_URL is not set (see .env.example)");
  }
  process.env.DATABASE_URL = testUrl;
  process.env.NODE_ENV = "test";
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = "test-session-secret-not-for-production";
  }

  // Apply migrations to the test database (idempotent).
  execSync("node db/migrate.js up", {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });

  // Seed known test accounts (idempotent; NODE_ENV=test is not production).
  execSync("node db/seeds/seed.js", {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: testUrl, NODE_ENV: "test" },
    stdio: "inherit",
  });
}
