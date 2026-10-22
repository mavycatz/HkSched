# Seed data — HK Duty

This seed creates the initial accounts and a spread of duty records. It is
**never run automatically**, and it refuses to write to a database that is not
a test database unless `FORCE_SEED=1` is set.

## Seed password (recorded ONCE, here)

All seeded accounts share this initial password:

```
HkDuty!ChangeMe1
```

> **CHANGE AFTER THE FIRST DEPLOY.** Log in as each account and change the
> password (or update `users.password_hash` directly) immediately after the
> first production seed. Treat this file as sensitive until then.

## Accounts

| Role    | School ID | Name              | Email                                      |
| ------- | --------- | ----------------- | ------------------------------------------ |
| CSDL    | CSDL-001  | Ana Reyes         | ana.reyes@hkscholastics.edu.ph             |
| TEACHER | T-001     | Luis Mendoza      | luis.mendoza@hkscholastics.edu.ph          |
| TEACHER | T-002     | Grace Lim         | grace.lim@hkscholastics.edu.ph             |
| STUDENT | S-001     | Marco Cruz        | marco.cruz@student.hkscholastics.edu.ph    |
| STUDENT | S-002     | Bea Santos        | bea.santos@student.hkscholastics.edu.ph    |
| STUDENT | S-003     | Karla Tan         | karla.tan@student.hkscholastics.edu.ph     |
| STUDENT | S-004     | Paolo Garcia      | paolo.garcia@student.hkscholastics.edu.ph  |
| STUDENT | S-005     | Nina Villanueva   | nina.villanueva@student.hkscholastics.edu.ph |

## Duty records

The seed also creates **86 duties** and **215 duty assignments**, spread over
21 days before and 21 days after the day the seed runs (so the month grid,
the status counts and the pagination all have data).

Two duties are placed on each seeded day, rotating through four templates:

| Template          | Area              | Time    | Assigned teacher | Assigned students |
| ----------------- | ----------------- | ------- | ---------------- | ----------------- |
| Library Duty      | Library           | 07:00   | T-001            | S-001, S-002, S-003 |
| Hallway Patrol    | Main Hallway      | 09:30   | T-002            | S-002, S-004      |
| Cafeteria Duty    | Cafeteria         | 11:45   | T-001            | S-003, S-005      |
| Laboratory Duty   | Science Laboratory | 13:30   | T-002            | S-001, S-004, S-005 |

Every duty records `assigned_by = CSDL-001`.

The status of a duty follows its position relative to today, so all four
statuses appear:

| Position            | Status                                        |
| ------------------- | --------------------------------------------- |
| before today        | `completed`, with every 5th one `cancelled`   |
| today               | `ongoing` (first duty) / `pending`            |
| after today         | `pending`, with every 3rd one `ongoing`       |

A duty from before today carries the completion on each of its assignment
rows, which is what makes it read as `completed`. The stored status is only
an explicit cancellation; everything else is derived from the duty's own
times and from its recorded completions.

Times are stored as `TIMESTAMPTZ` and interpreted in the `Asia/Manila`
calendar, which is the calendar the application displays.

### Clearing the duty data

The duty rows are keyed by title and start time, so re-running the seed on
the same day is a no-op. To remove the seeded duty data and start over:

```bash
# removes the seeded duty assignments first (they cascade from duties)
psql "$DATABASE_URL" -c "DELETE FROM duty_assignments; DELETE FROM duties;"
```

This deletes **every** duty and assignment in the database, including any
created by hand — do not run it against a database that holds real data.

## Duty locations

The seed also fills the `duty_locations` catalogue (migration
`006_duty_locations_and_status.sql`), the list of places a duty can be held
at:

| Location            | Kind        | Building      |
| ------------------- | ----------- | ------------- |
| Library             | area        | Main Building |
| Cafeteria           | area        | Main Building |
| Main Hallway        | area        | Main Building |
| Science Laboratory  | laboratory  | Main Building |
| Computer Laboratory | laboratory  | Main Building |
| Gymnasium           | facility    | Sports Building |
| Clinic              | office      | Main Building |
| Guidance Office     | office      | Main Building |
| Principal's Office  | office      | Main Building |

Every seeded duty points at the location named by its area, so the location
filter and the location picker have something to show. A location is only
offered while it is active; a duty that already points at a deactivated
location still shows it.

## Running

```bash
# apply the migrations first — the catalogue and the new duty columns live there
npm run db:migrate

# against a test database (the database name must contain "test")
DATABASE_URL=postgresql://user:pass@localhost:5432/hkduty_test npm run db:seed

# against any other database, only when that is intentional
FORCE_SEED=1 npm run db:seed
```

The seed refuses to run when `DATABASE_URL` points at a database whose name
does not contain `test`, or when `NODE_ENV=production`, unless `FORCE_SEED=1`
is set.

The seed is idempotent: existing `school_id` rows are left untouched, and an
existing duty (same title and start time) is not inserted again.
