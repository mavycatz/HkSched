# Seed data — HK Duty

This seed creates the initial accounts. It is **never run automatically**,
and it refuses to run when `NODE_ENV=production` unless `FORCE_SEED=1` is set.

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

## Running

```bash
npm run db:seed                      # development
FORCE_SEED=1 npm run db:seed         # production one-time manual job
```

The seed is idempotent: existing `school_id` rows are left untouched.
