#!/usr/bin/env node
/**
 * Migration runner (plain Node so production deploys never need the TS toolchain).
 * Usage: node db/migrate.js up|down
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// load env: server/.env then repo-root .env
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const MIGRATIONS_DIR = __dirname + path.sep + "migrations";

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function applied(pool) {
  const { rows } = await pool.query(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  return rows.map((r) => r.version);
}

async function up(pool) {
  const done = new Set(await applied(pool));
  const pending = listMigrations().filter((m) => !done.has(m));
  if (pending.length === 0) {
    console.log("migrate: nothing to do (idempotent)");
    return 0;
  }
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      console.log(`migrate: applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`migrate: FAILED ${file}: ${err.message}`);
      process.exitCode = 1;
      throw err;
    } finally {
      client.release();
    }
  }
  return pending.length;
}

async function down(pool) {
  const done = await applied(pool);
  if (done.length === 0) {
    console.log("rollback: nothing to do");
    return 0;
  }
  const last = done[done.length - 1];
  const downFile = last.replace(/\.sql$/, ".down.sql");
  const downPath = path.join(MIGRATIONS_DIR, downFile);
  if (!fs.existsSync(downPath)) {
    throw new Error(`rollback: missing ${downFile}`);
  }
  const sql = fs.readFileSync(downPath, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("DELETE FROM schema_migrations WHERE version = $1", [
      last,
    ]);
    await client.query("COMMIT");
    console.log(`rollback: reverted ${last}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`rollback: FAILED ${last}: ${err.message}`);
    process.exitCode = 1;
    throw err;
  } finally {
    client.release();
  }
  return 1;
}

async function main() {
  const cmd = process.argv[2] || "up";
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await ensureTable(pool);
    if (cmd === "up") await up(pool);
    else if (cmd === "down") await down(pool);
    else {
      console.error(`unknown command: ${cmd}`);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
