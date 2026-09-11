"use client";

import { useState, useTransition } from "react";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { CornerButton } from "@/components/ui/CornerButton";
import { FormSection } from "@/components/ui/FormSection";
import { FormActions } from "@/components/ui/FormActions";
import {
  ACTIVITIES,
  PRIORITIES,
  MAX_PRIORITIES,
  type ActivityKey,
} from "@/lib/modules";
import { updateWorkModules } from "./actions";

interface Props {
  initialActivities: ActivityKey[];
  initialPriorities: string[];
}

/**
 * Owner/admin editor for the workspace's "how you work" choices — the same
 * plain-language activities + priorities the onboarding wizard asks, so
 * nothing decided on day 0 is ever locked in.
 */
export function WorkModulesForm({ initialActivities, initialPriorities }: Props) {
  const [activities, setActivities] = useState<string[]>(initialActivities);
  const [priorities, setPriorities] = useState<string[]>(initialPriorities);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await updateWorkModules(fd);
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        })
      }
      className="hairline bg-[var(--surface)] p-16 flex flex-col gap-16"
    >
      <FormSection variant="plain" title="What you do day to day">
        <ChipGroup
          ariaLabel="Activities"
          name="activities"
          chips={ACTIVITIES.map((a) => ({
            value: a.key,
            label: a.label,
            desc: a.desc,
          }))}
          values={activities}
          onChange={setActivities}
        />
      </FormSection>

      <FormSection
        variant="plain"
        title="What the dashboard leads with"
        description={`Up to ${MAX_PRIORITIES}, in order.`}
      >
        <ChipGroup
          ariaLabel="Dashboard priorities"
          name="priorities"
          chips={PRIORITIES.map((p) => ({ value: p.key, label: p.label }))}
          values={priorities}
          onChange={setPriorities}
          max={MAX_PRIORITIES}
          showRank
        />
      </FormSection>

      <FormActions
        status={
          saved && (
            <span className="text-[var(--success)]" role="status">
              Saved
            </span>
          )
        }
      >
        <CornerButton type="submit" variant="ghost" size="sm" loading={pending}>
          Save modules
        </CornerButton>
      </FormActions>
    </form>
  );
}
