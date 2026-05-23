import { PageHeader } from "@/components/ui/PageHeader";
import { ScanWorkspace } from "./ScanWorkspace";

export const metadata = { title: "Scan & locate" };

export default async function ScanPage() {
  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Operate"
        title="Scan & locate"
        description="Scan a barcode — or type one into the field — to look it up against the catalog and jump to the next step: locate, pick, count, or reorder."
        meta={[
          { label: "Source", value: "USB / Bluetooth · HID keyboard" },
        ]}
      />

      <ScanWorkspace />
    </div>
  );
}