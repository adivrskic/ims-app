import { PageHeader } from "@/components/ui/PageHeader";
import { ScanWorkspace } from "./ScanWorkspace";

export const metadata = { title: "Scan & locate" };

export default async function ScanPage() {
  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        eyebrow="Operate"
        title="Scan & locate"
        description="Scan a barcode anywhere on this page. We'll look it up against the catalog and offer next-action paths — locate, pick, move, count, or adjust."
        meta={[
          { label: "Scanner", value: "Ready", status: "live" as const },
          { label: "Source", value: "USB / Bluetooth · HID keyboard" },
        ]}
      />

      <ScanWorkspace />
    </div>
  );
}
