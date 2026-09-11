import { PRODUCT_SPEC } from "@/lib/import/specs";
import { templateResponse } from "@/lib/import/templateResponse";

export const dynamic = "force-dynamic";

/** Legacy URL for the product template — same bytes as /api/import-template/products. */
export async function GET() {
  return templateResponse(PRODUCT_SPEC);
}
