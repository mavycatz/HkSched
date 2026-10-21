import type { Request } from "express";
import { getPool } from "../db/pool";

export async function audit(
  action: string,
  req: Request | undefined,
  userId: number | null = null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    const ip = req ? (req.ip ?? null) : null;
    const userAgent = req
      ? ((req.headers["user-agent"] ?? null)?.slice(0, 512) ?? null)
      : null;
    await getPool().query(
      `INSERT INTO audit_logs (action, user_id, ip, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [action, userId, ip, userAgent, JSON.stringify(meta)],
    );
  } catch (err) {
    // Auditing must never break the request flow; never log secrets here.
    console.error("[audit] failed to write audit log:", (err as Error).message);
  }
}
