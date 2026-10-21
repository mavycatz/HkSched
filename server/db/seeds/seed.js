#!/usr/bin/env node
/**
 * Seed script (plain Node). Creates the initial 3 roles' accounts.
 * Refuses to run in production unless FORCE_SEED=1.
 * Usage: npm run db:seed   |   FORCE_SEED=1 NODE_ENV=production npm run db:seed
 */
const path = require("path");
const argon2 = require("argon2");
const { Pool } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
require("dotenv").config({
  path: path.join(__dirname, "..", "..", "..", ".env"),
});

const SEED_PASSWORD = process.env.SEED_PASSWORD || "HkDuty!ChangeMe1";

const USERS = [
  {
    school_id: "CSDL-001",
    name: "Ana Reyes",
    email: "ana.reyes@hkscholastics.edu.ph",
    role: "CSDL",
  },
  {
    school_id: "T-001",
    name: "Luis Mendoza",
    email: "luis.mendoza@hkscholastics.edu.ph",
    role: "TEACHER",
  },
  {
    school_id: "T-002",
    name: "Grace Lim",
    email: "grace.lim@hkscholastics.edu.ph",
    role: "TEACHER",
  },
  {
    school_id: "S-001",
    name: "Marco Cruz",
    email: "marco.cruz@student.hkscholastics.edu.ph",
    role: "STUDENT",
  },
  {
    school_id: "S-002",
    name: "Bea Santos",
    email: "bea.santos@student.hkscholastics.edu.ph",
    role: "STUDENT",
  },
  {
    school_id: "S-003",
    name: "Karla Tan",
    email: "karla.tan@student.hkscholastics.edu.ph",
    role: "STUDENT",
  },
  {
    school_id: "S-004",
    name: "Paolo Garcia",
    email: "paolo.garcia@student.hkscholastics.edu.ph",
    role: "STUDENT",
  },
  {
    school_id: "S-005",
    name: "Nina Villanueva",
    email: "nina.villanueva@student.hkscholastics.edu.ph",
    role: "STUDENT",
  },
];

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.FORCE_SEED !== "1") {
    console.error(
      "seed: refused (NODE_ENV=production). The seed is a one-time manual job — rerun with FORCE_SEED=1 only when intentional."
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("seed: DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let inserted = 0;
    for (const u of USERS) {
      const password_hash = await argon2.hash(SEED_PASSWORD, {
        type: argon2.argon2id,
      });
      const { rowCount } = await pool.query(
        `INSERT INTO users (school_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (school_id) DO NOTHING`,
        [u.school_id, u.name, u.email, password_hash, u.role]
      );
      inserted += rowCount;
    }

    const { rows } = await pool.query(
      `SELECT role, count(*)::int AS count,
              count(*) FILTER (WHERE password_hash LIKE '$argon2%')::int AS hashed
       FROM users GROUP BY role ORDER BY role`
    );
    console.log(`seed: inserted ${inserted} new users`);
    for (const r of rows) {
      console.log(
        `  ${r.role}: ${r.count} users, ${r.hashed} argon2-hashed passwords`
      );
    }
    const { rows: plain } = await pool.query(
      `SELECT count(*)::int AS n FROM users
       WHERE password_hash NOT LIKE '$argon2%' AND password_hash NOT LIKE '$2b$%'`
    );
    if (plain[0].n > 0) {
      console.error(`seed: FAILED — ${plain[0].n} non-hashed passwords found`);
      process.exit(1);
    }
    console.log("seed: OK (hashes only, no plaintext passwords)");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`seed: FAILED — ${err.message}`);
  process.exit(1);
});
