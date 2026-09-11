import { IMPORT_SPECS, isImportEntity } from "@/lib/import/specs";
import { templateResponse } from "@/lib/import/templateResponse";

export const dynamic = "force-dynamic";

/**
 * CSV template for any import: /api/import-template/products | suppliers |
 * customers. Columns come from the same spec the importer matches against,
 * so the template can never drift from what the action accepts.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entity: string }> }
) {
  const { entity } = await params;
  if (!isImportEntity(entity)) return new Response("Not found", { status: 404 });
  return templateResponse(IMPORT_SPECS[entity]);
}
