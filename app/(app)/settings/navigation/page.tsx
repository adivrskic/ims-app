import {
  getCurrentOrgContext,
  getProfile,
  getActiveMembership,
} from "@/lib/data/user";
import { defaultNavPrefs } from "@/lib/navData";
import { INDUSTRIES, getIndustry } from "@/lib/industries";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CornerButton } from "@/components/ui/CornerButton";
import { Select } from "@/components/ui/Select";
import { activitiesFromModules } from "@/lib/modules";
import { NavCustomizer } from "./NavCustomizer";
import { WorkModulesForm } from "./WorkModulesForm";
import { updateIndustry } from "./actions";

export const metadata = { title: "Navigation" };

export default async function NavigationSettingsPage() {
  const [ctx, profile, active] = await Promise.all([
    getCurrentOrgContext(),
    getProfile(),
    getActiveMembership(),
  ]);

  const industry = active?.org?.industry ?? null;
  const orgModules = active?.org?.enabled_modules ?? null;
  const orgPriorities = active?.org?.priorities ?? null;
  const navPrefs = profile?.nav_prefs ?? null;
  const effective = navPrefs ?? defaultNavPrefs(industry, orgModules);
  const industryLabel = getIndustry(industry)?.label ?? null;
  // Gate on the permission the actions actually check. Gating on role alone
  // meant an admin whose custom permission set dropped `settings.manage` saw
  // an editable form whose save silently did nothing.
  const canEditIndustry = ctx?.can("settings.manage") ?? false;

  return (
    <div className="flex flex-col gap-32 max-w-[640px]">
      {/* Industry — workspace-level (owner/admin) */}
      <section>
        <SectionTitle numeral="01" eyebrow="Workspace" title="Industry" />
        <p className="mono-sm text-text-muted mb-12" style={{ lineHeight: 1.6 }}>
          Your industry sets the default sidebar for everyone in the workspace,
          surfacing the tools that matter most for your operation.
        </p>

        {canEditIndustry ? (
          <form
            action={updateIndustry}
            className="hairline bg-[var(--surface)] p-16 flex flex-col sm:flex-row sm:items-end gap-12"
          >
            <Select
              label="Industry"
              name="industry"
              defaultValue={industry ?? ""}
              ariaLabel="Industry"
              placeholder="— None —"
              className="flex-1"
              options={INDUSTRIES.map((ind) => ({
                value: ind.slug,
                label: ind.label,
              }))}
            />
            <CornerButton type="submit" variant="ghost" size="sm">
              Save industry
            </CornerButton>
          </form>
        ) : (
          <div className="hairline bg-[var(--surface)] px-16 py-12">
            <span
              className="text-text"
              style={{ fontFamily: "var(--display)", fontSize: 13 }}
            >
              {industryLabel ?? "Not set"}
            </span>
            <p className="mono-sm text-text-dim mt-2">
              Only owners and admins can change the workspace industry.
            </p>
          </div>
        )}
      </section>

      {/* Workspace modules + priorities — the onboarding choices, editable */}
      {canEditIndustry && (
        <section>
          <SectionTitle numeral="02" eyebrow="Workspace" title="How you work" />
          <p
            className="mono-sm text-text-muted mb-12"
            style={{ lineHeight: 1.6 }}
          >
            The same choices from setup: what you do decides which tools are
            front-and-center for the whole workspace, and your priorities
            decide what the overview dashboard leads with. Anything turned off
            stays reachable under “More” and via ⌘K.
          </p>
          <WorkModulesForm
            initialActivities={activitiesFromModules(orgModules)}
            initialPriorities={orgPriorities ?? []}
          />
        </section>
      )}

      {/* Per-user sidebar customization */}
      <section>
        <SectionTitle
          numeral={canEditIndustry ? "03" : "02"}
          eyebrow="Personal"
          title="Your sidebar"
        />
        <p className="mono-sm text-text-muted mb-12" style={{ lineHeight: 1.6 }}>
          Show, hide, and reorder your sidebar items. This is personal to you —
          it won&apos;t change what your teammates see. Hidden items still live
          under “More” and are always reachable from the command palette (⌘K).
        </p>
        <NavCustomizer
          initialPrefs={effective}
          isCustom={!!navPrefs}
          industryLabel={industryLabel}
        />
      </section>
    </div>
  );
}
