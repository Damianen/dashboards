// Shared result envelope for server actions. Plain module (no "use server")
// so both the server action wrappers and client hooks can import it.
//
// Server actions never throw across the RSC boundary — they return an
// ActionResult. Client code calls unwrap(), which rethrows a typed
// ActionError so TanStack Query's onError fires with a real Error.

import { ZodError } from "zod";

import {
  DomainError,
  InvalidMoveError,
  InvalidOperationError,
  NotFoundError,
  NotImplementedError,
} from "@/server/services/errors";

export type ActionErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "INVALID_MOVE"
  | "INVALID_OPERATION"
  | "NOT_IMPLEMENTED"
  | "INTERNAL";

export interface ActionErrorShape {
  code: ActionErrorCode;
  message: string;
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorShape };

function mapError(err: unknown): ActionErrorShape {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first?.path.join(".");
    return {
      code: "VALIDATION",
      message: first
        ? path
          ? `${path}: ${first.message}`
          : first.message
        : "Invalid input",
    };
  }
  if (err instanceof NotFoundError)
    return { code: "NOT_FOUND", message: err.message };
  if (err instanceof InvalidMoveError)
    return { code: "INVALID_MOVE", message: err.message };
  if (err instanceof InvalidOperationError)
    return { code: "INVALID_OPERATION", message: err.message };
  if (err instanceof NotImplementedError)
    return { code: "NOT_IMPLEMENTED", message: err.message };
  if (err instanceof DomainError)
    return { code: "INTERNAL", message: err.message };
  return { code: "INTERNAL", message: "Something went wrong" };
}

/** Run a service call and fold success/known errors into an ActionResult. */
export async function toActionResult<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: mapError(err) };
  }
}

/** Carries an ActionResult error code so the UI can branch on it. */
export class ActionError extends Error {
  readonly code: ActionErrorCode;
  constructor(error: ActionErrorShape) {
    super(error.message);
    this.name = "ActionError";
    this.code = error.code;
  }
}

/** Unwrap on the client: return data, or throw a typed ActionError. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data;
  throw new ActionError(result.error);
}
