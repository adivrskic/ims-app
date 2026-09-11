import "server-only";
import { getCurrentOrgContext } from "@/lib/data/user";
import type { ImportSpec } from "./spec";
import { templateCsv, templateFilename } from "./template";

/** CSV template download for one import spec. Session-gated like every export. */
export async function templateResponse(spec: ImportSpec): Promise<Response> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  return new Response(templateCsv(spec), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${templateFilename(spec)}"`,
    },
  });
}
