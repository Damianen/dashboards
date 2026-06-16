// Shared building blocks for all input schemas. These schemas are the single
// source of truth for inputs, reused by server actions, route handlers AND
// (later) MCP tools.

import { z } from "zod";

export const idSchema = z.string().min(1);

/** Opaque keyset-pagination cursor (base64url). */
export const cursorSchema = z.string().min(1);
