import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "./errors";
import { deleteSession, setSessionFinished } from "./lifting";

const sessionUpdate =
  vi.fn<(args: { where: unknown; data: Record<string, unknown> }) => Promise<unknown>>();
const sessionDelete = vi.fn<(args: unknown) => Promise<unknown>>();
const sessionFindUnique = vi.fn<(args: unknown) => Promise<unknown>>();

vi.mock("@/server/db", () => ({
  prisma: {
    liftingSession: {
      update: (args: { where: unknown; data: Record<string, unknown> }) =>
        sessionUpdate(args),
      delete: (args: unknown) => sessionDelete(args),
      findUnique: (args: unknown) => sessionFindUnique(args),
    },
  },
}));

/** Minimal session fixture for the trailing getSession: empty planItems/sets
 *  short-circuit the prior-session lookups, and templateId null skips the
 *  template-ordinal count. */
function bareSession() {
  return {
    id: "s1",
    day: new Date("2026-07-01T00:00:00.000Z"),
    startedAt: new Date("2026-07-01T17:00:00.000Z"),
    endedAt: null,
    templateId: null,
    planItems: [],
    sets: [],
  };
}

function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("No record found", {
    code: "P2025",
    clientVersion: "test",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUpdate.mockResolvedValue({ id: "s1" });
  sessionFindUnique.mockResolvedValue(bareSession());
});

describe("setSessionFinished", () => {
  it("stamps endedAt with a Date when finishing", async () => {
    await setSessionFinished("s1", true);

    const call = sessionUpdate.mock.calls[0];
    if (!call) throw new Error("expected liftingSession.update to be called");
    expect(call[0].where).toEqual({ id: "s1" });
    expect(call[0].data.endedAt).toBeInstanceOf(Date);
  });

  it("clears endedAt when reopening", async () => {
    await setSessionFinished("s1", false);

    const call = sessionUpdate.mock.calls[0];
    if (!call) throw new Error("expected liftingSession.update to be called");
    expect(call[0].data.endedAt).toBeNull();
  });

  it("returns the refreshed session detail", async () => {
    const detail = await setSessionFinished("s1", true);

    expect(detail.sessionId).toBe("s1");
    expect(detail.day).toBe("2026-07-01");
    expect(detail.exercises).toEqual([]);
  });

  it("maps Prisma's P2025 to NotFoundError", async () => {
    sessionUpdate.mockRejectedValue(p2025());

    await expect(setSessionFinished("missing", true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("deleteSession", () => {
  it("deletes by id", async () => {
    sessionDelete.mockResolvedValue({ id: "s1" });

    await deleteSession("s1");

    expect(sessionDelete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("maps Prisma's P2025 to NotFoundError", async () => {
    sessionDelete.mockRejectedValue(p2025());

    await expect(deleteSession("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
