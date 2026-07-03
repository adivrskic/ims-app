import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { NlQueryIntent } from "@/lib/ai/nl-types";

interface NlQueryResponse {
  intent: NlQueryIntent;
}

/**
 * Turn a plain-English query into a structured search intent by invoking the
 * `nl-query-index` Supabase edge function (source in supabase/functions/).
 *
 * Mirrors lib/ai/narrate.ts exactly: returns null on any failure so the caller
 * falls back to the palette's normal command matching. The LLM being down must
 * never break search.
 */
export async function nlQuery(query: string): Promise<NlQueryIntent | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.functions.invoke<NlQueryResponse>(
      "nl-query-index",
      { body: { query } }
    );
    if (error || !data?.intent) return null;
    return data.intent;
  } catch {
    return null;
  }
}
