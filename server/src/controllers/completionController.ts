/**
 * The completion endpoints.
 *
 * Recording a completion is only allowed to the teacher supervising the duty
 * and to CSDL; the rule lives in the duty service, so the endpoint and the
 * page cannot disagree about who may write.
 */
import type { Request, Response, NextFunction } from "express";
import {
  ForbiddenError,
  recordCompletion,
  recordStudentCompletion,
  type CompletionActor,
} from "../services/dutyService";

/** The signed-in user, as the completion service knows them. */
function actor(req: Request): CompletionActor {
  const user = req.user!;
  return { id: user.id, role: user.role };
}

/** Record the whole duty as complete. */
export async function postCompleteDuty(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dutyId = Number(req.params.id);
    if (!Number.isInteger(dutyId) || dutyId <= 0) {
      res.status(404).json({ error: "That duty no longer exists." });
      return;
    }
    const updated = await recordCompletion(dutyId, actor(req));
    res.json({ ok: true, duty_id: dutyId, completed: updated });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      res.status(403).json({ error: error.message });
      return;
    }
    next(error);
  }
}

/** Record one student's completion. */
export async function postCompleteAssignment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      res.status(404).json({ error: "That assignment no longer exists." });
      return;
    }
    const recorded = await recordStudentCompletion(assignmentId, actor(req));
    if (!recorded) {
      res.status(404).json({ error: "That assignment no longer exists." });
      return;
    }
    res.json({ ok: true, assignment_id: assignmentId });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      res.status(403).json({ error: error.message });
      return;
    }
    next(error);
  }
}
