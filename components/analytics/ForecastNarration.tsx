import { Sparkles } from "lucide-react";
import { narrateForecast } from "@/lib/ai/narrate";

interface Props {
  scope: string;
  window: { start: string; end: string };
  metrics: {
    totalScans: number;
    scansToday: number;
    scansLast7: number;
    totalStock: number;
    lowStockCount: number;
    actionMix: Array<{ action: string; count: number; pct: number }>;
    trend14d: number[];
    topSections?: Array<{ code: string; pct: number }>;
  };
}

/**
 * AI-narrated 2-3 sentence summary of the Analytics window. Renders as a
 * server component so the LLM call happens during page render. The result
 * is cached server-side by content hash — repeat visits with the same
 * metrics are instant.
 *
 * Wrap in <Suspense> at the call site so the rest of the page paints
 * while this resolves.
 */
export async function ForecastNarration({ scope, window, metrics }: Props) {
  const result = await narrateForecast({ scope, window, metrics });

  if (!result) {
    // LLM unavailable — render nothing rather than a broken placeholder.
    return null;
  }

  return (
    <aside
      className="hairline-subtle bg-[var(--surface-2)] px-16 py-12 flex items-start gap-12"
      aria-label="AI summary"
    >
      <span
        className="w-22 h-22 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)]"
        aria-hidden
      >
        <Sparkles size={11} strokeWidth={1.5} />
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <p className="label-text text-text-muted">
          Summary
          {result.cached && (
            <span className="ml-8 text-text-dim">· cached</span>
          )}
        </p>
        <p
          className="text-text"
          style={{
            fontFamily: "var(--display)",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          {result.narration}
        </p>
      </div>
    </aside>
  );
}
