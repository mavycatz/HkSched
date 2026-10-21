import { getPool } from "../db/pool";

export interface UserRecord {
  id: number;
  school_id: string;
  full_name: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "CSDL";
  is_active: boolean;
  password_hash: string;
}

const COLS = "id, school_id, name AS full_name, email, role, is_active, password_hash";

export async function findUserByIdentifier(identifier: string): Promise<UserRecord | null> {
  const { rows } = await getPool().query<UserRecord>(
    `SELECT ${COLS} FROM users
     WHERE lower(school_id) = lower($1) OR lower(email) = lower($1)
     LIMIT 1`,
    [identifier],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  const { rows } = await getPool().query<UserRecord>(
    `SELECT ${COLS} FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}
