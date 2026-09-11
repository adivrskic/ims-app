import { ImportPage } from "@/components/import/ImportPage";
import { importProducts } from "./actions";

export const metadata = { title: "Import products" };

export default function ImportProductsPage() {
  return (
    <ImportPage
      entity="products"
      eyebrow="Workspace · Inventory"
      title="Import products"
      description="Bring your whole catalog in from a spreadsheet — with on-hand quantities, costs, categories and suppliers if you have them. Check first, then import; rows with problems are reported by row number and the rest still go in."
      backHref="/inventory"
      backLabel="All products"
      action={importProducts}
      doneHref="/inventory"
    />
  );
}
