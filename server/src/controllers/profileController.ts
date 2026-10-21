import type { Request, Response, NextFunction } from "express";
import { statusLocals } from "../middleware/auth";
import { getProfileViewModel } from "../services/profileService";
import { hashPassword, verifyPassword } from "../lib/password";
import { findUserById, updatePasswordHash } from "../lib/users";
import { audit } from "../lib/audit";

/**
 * The profile page, shared by `/profile` and `/csdl/profile`.
 *
 * The page shows the signed-in user's own record. The only write in the whole
 * profile area is the password change, which re-hashes with the existing
 * argon2id helper and is audited.
 */

/** The path the profile page lives at for a role. */
function profilePathFor(role: "STUDENT" | "TEACHER" | "CSDL"): string {
  return role === "CSDL" ? "/csdl/profile" : "/profile";
}

export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const profile = await getProfileViewModel(user.id);
    if (!profile) {
      res.redirect("/login");
      return;
    }

    const query = req.query as Record<string, string>;
    const tab = ["details", "password", "notifications"].includes(query.tab)
      ? query.tab
      : "details";

    res.render("pages/profile", {
      ...statusLocals(req, res),
      title: "Profile & Settings",
      bodyClass: "profile-page",
      activePath: profilePathFor(user.role),
      pageStyles: ["profile"],
      pageScripts: ["profile"],
      profile,
      activeTab: tab,
      passwordChanged: query.password === "changed",
      passwordError: null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /profile/password — change the signed-in user's own password.
 *
 * The current password is verified with the argon2id helper, the new one has
 * to be at least 8 characters and different from the current one, and the
 * stored credential is replaced with a fresh hash. The session is preserved.
 */
export async function postProfilePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const body = req.body as Record<string, unknown>;
    const current = typeof body.current_password === "string" ? body.current_password : "";
    const next1 = typeof body.new_password === "string" ? body.new_password : "";
    const confirm = typeof body.confirm_password === "string" ? body.confirm_password : "";

    const profile = await getProfileViewModel(user.id);
    if (!profile) {
      res.redirect("/login");
      return;
    }

    const record = await findUserById(user.id);
    const currentOk = record ? await verifyPassword(record.password_hash, current) : false;

    let error: string | null = null;
    if (!currentOk) {
      error = "The current password is incorrect.";
    } else if (next1.length < 8) {
      error = "The new password must be at least 8 characters long.";
    } else if (next1 === current) {
      error = "The new password must be different from the current password.";
    } else if (next1 !== confirm) {
      error = "The new password and the confirmation do not match.";
    }

    if (error) {
      res.status(400).render("pages/profile", {
        ...statusLocals(req, res),
        title: "Profile & Settings",
        bodyClass: "profile-page",
        activePath: profilePathFor(user.role),
        pageStyles: ["profile"],
        pageScripts: ["profile"],
        profile,
        activeTab: "password",
        passwordChanged: false,
        passwordError: error,
      });
      return;
    }

    const hash = await hashPassword(next1);
    await updatePasswordHash(user.id, hash);
    // No secret is recorded — only that the credential was replaced.
    await audit("password_changed", req, user.id, { method: "self-service" });

    res.redirect(`${profilePathFor(user.role)}?tab=password&password=changed`);
  } catch (err) {
    next(err);
  }
}
