import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { GlowCardGrid } from "@/components/dashboard/GlowCardGrid";
import { Activity, Boxes, BarChart3 } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  eyebrow: string;
  title: string;
  description: string;
  empty: { title: string; description: string };
  icon: ReactNode;
}

/**
 * Pages that already work today. Stub pages show these via glow cards so the
 * user lands somewhere productive instead of dead-ending at "back to overview".
 */
const AVAILABLE = [
  {
    href: "/",
    icon: <Activity size={16} strokeWidth={1.5} />,
    label: "Overview",
    description: "Live ops snapshot, KPIs, and recent scans.",
    meta: "Open",
  },
  {
    href: "/inventory",
    icon: <Boxes size={16} strokeWidth={1.5} />,
    label: "Inventory",
    description: "Every SKU across every facility.",
    meta: "Open",
  },
  {
    href: "/analytics",
    icon: <BarChart3 size={16} strokeWidth={1.5} />,
    label: "Analytics",
    description: "Velocity, distribution, action mix.",
    meta: "Open",
  },
];

export function ComingSoon({
  eyebrow,
  title,
  description,
  empty,
  icon,
}: Props) {
  return (
    <div className="flex flex-col gap-32">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <EmptyState
        title={empty.title}
        description={empty.description}
        icon={icon}
      />

      <section aria-labelledby="available">
        <SectionTitle eyebrow="In the meantime" title="Available now" />
        <GlowCardGrid cards={AVAILABLE} />
      </section>
    </div>
  );
}
