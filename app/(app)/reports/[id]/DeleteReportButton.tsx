"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { deleteReport } from "../actions";

interface Props {
  reportId: string;
  reportName: string;
}

/**
 * Delete lives next to Export in the header, so a stray click is easy —
 * and the saved definition isn't recoverable. Same confirm-then-act shape
 * the other destructive affordances use.
 */
export function DeleteReportButton({ reportId, reportName }: Props) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (
      !confirm(
        `Delete “${reportName}”? The saved definition is gone for everyone in the workspace — CSVs you've already exported are unaffected.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", reportId);
      await deleteReport(formData);
    });
  };

  return (
    <CornerButton
      type="button"
      variant="danger"
      size="sm"
      onClick={handleClick}
      loading={pending}
    >
      <Trash2 size={11} strokeWidth={1.5} />
      Delete
    </CornerButton>
  );
}
