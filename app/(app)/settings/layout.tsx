import { PageHeader } from "@/components/ui/PageHeader";
import { SettingsTabs } from "./SettingsTabs";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-24 flex-1 min-h-0">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Account, team, developer access, and workspace history."
      />
      <SettingsTabs />
      {/*
        Children area is flex-1 so it absorbs the remaining vertical space
        between the SettingsTabs and the bottom of the main wrapper.
        Sub-pages that set their root to `flex-1 min-h-0` (the facilities
        list, the builder) will then fill this area completely.
      */}
      <div className="pt-8 flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
