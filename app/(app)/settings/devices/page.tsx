import { SectionTitle } from "@/components/ui/SectionTitle";
import { DevicesClient } from "./DevicesClient";

export const metadata = { title: "Devices · Settings" };

export default function DevicesSettingsPage() {
  return (
    <div className="flex flex-col gap-40">
      <section aria-labelledby="overview">
        <SectionTitle eyebrow="Hardware" title="Connected devices" />
        <p
          className="mono-sm text-text-muted hairline bg-[var(--surface)] px-20 py-16"
          style={{ lineHeight: 1.6 }}
        >
          Configure the USB barcode scanner and Zebra label printer this
          workstation will use. Connections persist per browser, per origin — do
          this once on each workstation and you&apos;re set.
        </p>
      </section>

      <DevicesClient />
    </div>
  );
}
