"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { getJSON, HttpError, postJSON, putJSON } from "@/lib/fetcher";
import { queryKeys } from "@/lib/hooks/keys";
import type { CreateTemplateInput } from "@/lib/schemas/template";
// Type-only imports: erased at build time, so no server code is bundled.
import type {
  StartedSessionView,
  TemplateView,
} from "@/server/services/templates";

/**
 * The shape the client receives: Dates serialise to ISO strings over HTTP. The
 * service already coerced Decimal targets to numbers, so the exercises array is
 * client-ready as-is.
 */
export type TemplateDTO = Omit<TemplateView, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export type TemplateExerciseDTO = TemplateDTO["exercises"][number];

/** Zod's flatten() error body returned by the create/update routes at 400. */
interface ZodFlatten {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
}

/**
 * A 400 from save: either Zod's flatten() (field/form errors) or a domain error
 * (`{ error }`, e.g. duplicate name). The editor maps `fieldErrors.name` and
 * `message` next to the name field and shows the rest in a banner.
 */
export class TemplateSaveError extends Error {
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
  constructor(
    message: string,
    opts?: {
      fieldErrors?: Record<string, string[] | undefined>;
      formErrors?: string[];
    },
  ) {
    super(message);
    this.name = "TemplateSaveError";
    this.fieldErrors = opts?.fieldErrors;
    this.formErrors = opts?.formErrors;
  }
}

function toSaveError(body: unknown): TemplateSaveError {
  if (body && typeof body === "object") {
    if ("fieldErrors" in body || "formErrors" in body) {
      const flat = body as ZodFlatten;
      return new TemplateSaveError("Some fields need fixing", {
        fieldErrors: flat.fieldErrors,
        formErrors: flat.formErrors,
      });
    }
    if ("error" in body && typeof (body as { error: unknown }).error === "string") {
      return new TemplateSaveError((body as { error: string }).error);
    }
  }
  return new TemplateSaveError("Couldn't save template");
}

/** POST/PUT a template, surfacing 400 bodies as a typed TemplateSaveError for
 *  inline field errors (rebuilt from HttpError.body). */
async function saveTemplate(
  url: string,
  method: "POST" | "PUT",
  body: CreateTemplateInput,
): Promise<TemplateDTO> {
  try {
    return method === "POST"
      ? await postJSON<TemplateDTO>(url, body)
      : await putJSON<TemplateDTO>(url, body);
  } catch (err) {
    if (err instanceof HttpError && err.status === 400) {
      throw toSaveError(err.body);
    }
    throw err;
  }
}

/** All templates (or active-only). Belt-and-suspenders: the section also filters
 *  by `archived` client-side so the archive optimistic flip is instant. */
export function useTemplates(includeArchived: boolean) {
  const qs = includeArchived ? "?includeArchived=true" : "";
  return useQuery({
    queryKey: queryKeys.templateList(includeArchived),
    queryFn: () => getJSON<TemplateDTO[]>(`/api/lifting/templates${qs}`),
  });
}

/** A single template for the editor (edit mode). */
export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.template(id ?? ""),
    queryFn: () => getJSON<TemplateDTO>(`/api/lifting/templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      saveTemplate("/api/lifting/templates", "POST", input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.templates() });
    },
  });
}

export function useUpdateTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      saveTemplate(`/api/lifting/templates/${id}`, "PUT", input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.templates() });
    },
  });
}

export function useDuplicateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      postJSON<TemplateDTO>(`/api/lifting/templates/${id}/duplicate`, {}),
    onError: () => toast.error("Couldn't duplicate template"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.templates() });
    },
  });
}

interface ArchiveVars {
  id: string;
  archived: boolean;
}

export function useArchiveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: ArchiveVars) =>
      postJSON<TemplateDTO>(`/api/lifting/templates/${id}/archive`, { archived }),
    onMutate: async ({ id, archived }) => {
      await qc.cancelQueries({ queryKey: queryKeys.templates() });
      // Snapshot every cached list and flip the flag optimistically. Detail caches
      // (single objects) are skipped via the Array guard.
      const snapshots = qc.getQueriesData({ queryKey: queryKeys.templates() });
      for (const [key, data] of snapshots) {
        if (!Array.isArray(data)) continue;
        qc.setQueryData<TemplateDTO[]>(
          key,
          data.map((t) => (t.id === id ? { ...t, archived } : t)),
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error("Couldn't update template");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.templates() });
    },
  });
}

export function useStartFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      postJSON<StartedSessionView>("/api/lifting/sessions/from-template", {
        templateId,
      }),
    onSuccess: (session) => {
      toast.success("Workout started");
      void qc.invalidateQueries({ queryKey: queryKeys.lifting() });
      void qc.invalidateQueries({ queryKey: queryKeys.summary(session.day) });
    },
    onError: () => toast.error("Couldn't start workout"),
  });
}
