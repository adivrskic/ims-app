# Supabase Edge Functions

Deno edge functions for the `nimbus-wms` Supabase project. These were previously
deployed out-of-band (source lived only on Supabase); this directory is the
source of record so they can be rebuilt / redeployed reproducibly.

| Function | verify_jwt | Purpose | Env |
|----------|-----------|---------|-----|
| `narrate-event` | yes | LLM prose for forecast / anomaly / PO-draft events; caches to `app.ai_narrations` (Claude Haiku 4.5). Called by `lib/ai/narrate.ts`. | `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `parse-warehouse-layout` | yes | Vision: extract storage sections from a floor-plan image (Claude Sonnet). | `ANTHROPIC_API_KEY` |
| `nl-query-index` | yes | Parse a plain-English search into a structured intent (Claude Haiku). Called by `lib/ai/nlQuery`. | `ANTHROPIC_API_KEY` |

> The runtime slug is `nl-query-index` (the file header still references the
> older `nl-query` name from the reference repo).

## Deploy

```
supabase functions deploy narrate-event --project-ref seypbrzjjiuibrwyxewj
supabase functions deploy parse-warehouse-layout --project-ref seypbrzjjiuibrwyxewj
supabase functions deploy nl-query-index --project-ref seypbrzjjiuibrwyxewj
```

Secrets are set once per project via `supabase secrets set ANTHROPIC_API_KEY=...`.
All degrade gracefully in the app if unavailable (narration / NL-search fall back
to null / command matching), so a missing deploy is non-fatal.
