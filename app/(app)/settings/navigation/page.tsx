import {
  getCurrentOrgContext,
  getProfile,
  getActiveMembership,
} from "@/lib/data/user";
import { defaultNavPrefs } from "@/lib/navData";
import { INDUSTRIES, getIndustry } from "@/lib/industries";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CornerButton } from "@/components/ui/CornerButton";
import { NavCustomizer } from "./NavCustomizer";
import { updateIndustry } from "./actions";

export const metadata = { title: "Navigation" };

export default async function NavigationSettingsPage() {
  const [ctx, profile, active] = await Promise.all([
    getCurrentOrgContext(),
    getProfile(),
    getActiveMembership(),
  ]);

  const industry = active?.org?.industry ?? null;
  const navPrefs = profile?.nav_prefs ?? null;
  const effective = navPrefs ?? defaultNavPrefs(industry);
  const industryLabel = getIndustry(industry)?.label ?? null;
  const canEditIndustry = ctx?.role === "owner" || ctx?.role === "admin";

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
            <label className="field-shell block flex-1" data-filled="true">
              <span className="field-label">Industry</span>
              <select
                name="industry"
                defaultValue={industry ?? ""}
                className="field-input cursor-pointer"
                aria-label="Industry"
              >
                <option value="">— None —</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind.slug} value={ind.slug}>
                    {ind.label}
                  </option>
                ))}
              </select>
            </label>
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

      {/* Per-user sidebar customization */}
      <section>
        <SectionTitle numeral="02" eyebrow="Personal" title="Your sidebar" />
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
