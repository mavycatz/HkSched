#!/usr/bin/env node
/**
 * Seed script (plain Node). Creates the initial 3 roles' accounts plus a
 * spread of duty records and their student assignments.
 *
 * Refuses to run against a database that is not a test database unless
 * FORCE_SEED=1 is set (see README.md).
 *
 * Usage:
 *   npm run db:seed
 *   FORCE_SEED=1 npm run db:seed
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

/**
 * The duty templates. Two of them are placed on each seeded day, rotating
 * so the calendar shows a different mix every day.
 */
const DUTY_TEMPLATES = [
  {
    title: "Library Duty",
    area: "Library",
    hour: 7,
    minute: 0,
    durationMin: 60,
    teacher: "T-001",
    students: ["S-001", "S-002", "S-003"],
  },
  {
    title: "Hallway Patrol",
    area: "Main Hallway",
    hour: 9,
    minute: 30,
    durationMin: 60,
    teacher: "T-002",
    students: ["S-002", "S-004"],
  },
  {
    title: "Cafeteria Duty",
    area: "Cafeteria",
    hour: 11,
    minute: 45,
    durationMin: 45,
    teacher: "T-001",
    students: ["S-003", "S-005"],
  },
  {
    title: "Laboratory Duty",
    area: "Science Laboratory",
    hour: 13,
    minute: 30,
    durationMin: 60,
    teacher: "T-002",
    students: ["S-001", "S-004", "S-005"],
  },
];

/** How many days before and after today the seed covers. */
const DAYS_BEFORE = 21;
const DAYS_AFTER = 21;

/** The database name in a Postgres connection string. */
function databaseName(url) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "";
  } catch {
    return "";
  }
}

/**
 * True when the connection string points at a database that is meant for
 * tests. The seed refuses to touch anything else without FORCE_SEED=1.
 */
function isTestDatabase(url) {
  const name = databaseName(url).toLowerCase();
  if (!name) return false;
  return name === "test" || name.includes("test");
}

/** Today's date in the Manila calendar, as a UTC midnight date. */
function manilaToday() {
  const now = new Date();
  const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return new Date(Date.UTC(manila.getFullYear(), manila.getMonth(), manila.getDate()));
}

/** A UTC instant for a Manila wall-clock time on a day offset from today. */
function manilaInstant(base, offsetDays, hour, minute) {
  return new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate() + offsetDays,
      hour - 8,
      minute,
      0,
      0
    )
  );
}

/** The status a seeded duty should carry, so all four statuses appear. */
function statusFor(offset, slot) {
  if (offset < 0) return (offset + slot) % 5 === 0 ? "missed" : "completed";
  if (offset === 0) return slot === 0 ? "ongoing" : "pending";
  return (offset + slot) % 3 === 0 ? "ongoing" : "pending";
}

async function seedUsers(pool) {
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
  return inserted;
}

/**
 * Insert the duty rows and their student assignments. A duty is identified
 * by its title and start time, so re-running the seed on the same day does
 * not create duplicates.
 */
async function seedDuties(pool) {
  const { rows: userRows } = await pool.query(
    `SELECT id, school_id FROM users`
  );
  const ids = new Map(userRows.map((r) => [r.school_id, r.id]));
  const csdlId = ids.get("CSDL-001");
  if (!csdlId) {
    throw new Error("seed: CSDL-001 is missing — seed the users first");
  }

  const base = manilaToday();
  let duties = 0;
  let assignments = 0;

  for (let offset = -DAYS_BEFORE; offset <= DAYS_AFTER; offset += 1) {
    for (let slot = 0; slot < 2; slot += 1) {
      const templateIndex = (((offset + slot) % DUTY_TEMPLATES.length) + DUTY_TEMPLATES.length) % DUTY_TEMPLATES.length;
      const template = DUTY_TEMPLATES[templateIndex];
      const start = manilaInstant(base, offset, template.hour, template.minute);
      const end = new Date(start.getTime() + template.durationMin * 60 * 1000);
      const status = statusFor(offset, slot);
      const teacherId = ids.get(template.teacher) ?? null;

      const { rows } = await pool.query(
        `INSERT INTO duties (title, description, area, status, assigned_to, assigned_by, start_time, end_time)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8
         WHERE NOT EXISTS (
           SELECT 1 FROM duties WHERE title = $1 AND start_time = $7
         )
         RETURNING id`,
        [
          template.title,
          `Seeded ${template.title.toLowerCase()} in the ${template.area}.`,
          template.area,
          status,
          teacherId,
          csdlId,
          start,
          end,
        ]
      );
      if (rows.length === 0) continue;
      duties += 1;

      const dutyId = rows[0].id;
      for (const schoolId of template.students) {
        const studentId = ids.get(schoolId);
        if (!studentId) continue;
        const { rowCount } = await pool.query(
          `INSERT INTO duty_assignments (duty_id, student_id)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM duty_assignments WHERE duty_id = $1 AND student_id = $2
           )`,
          [dutyId, studentId]
        );
        assignments += rowCount;
      }
    }
  }

  return { duties, assignments };
}

async function main() {
  const forced = process.env.FORCE_SEED === "1";

  if (!forced && process.env.NODE_ENV === "production") {
    console.error(
      "seed: refused (NODE_ENV=production). The seed is a one-time manual job — rerun with FORCE_SEED=1 only when intentional."
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("seed: DATABASE_URL is not set");
    process.exit(1);
  }
  if (!forced && !isTestDatabase(process.env.DATABASE_URL)) {
    console.error(
      `seed: refused — DATABASE_URL points at "${databaseName(process.env.DATABASE_URL)}", which is not a test database. ` +
        "Set DATABASE_URL to a test database, or rerun with FORCE_SEED=1 when writing to a real database is intentional."
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const inserted = await seedUsers(pool);
    const { duties, assignments } = await seedDuties(pool);

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

    const { rows: dutyRows } = await pool.query(
      `SELECT status, count(*)::int AS count FROM duties GROUP BY status ORDER BY status`
    );
    console.log(`seed: ${duties} new duties, ${assignments} new duty assignments`);
    for (const r of dutyRows) {
      console.log(`  duty ${r.status}: ${r.count}`);
    }
    const { rows: assignmentRows } = await pool.query(
      `SELECT count(*)::int AS count FROM duty_assignments`
    );
    console.log(`seed: ${assignmentRows[0].count} duty assignments in total`);

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
