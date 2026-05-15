import { PageHeader } from "@/components/ui/PageHeader";
import { SettingsTabs } from "./SettingsTabs";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-24">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Account, team, developer access, and workspace history."
      />
      <SettingsTabs />
      <div className="pt-8">{children}</div>
    </div>
  );
}
