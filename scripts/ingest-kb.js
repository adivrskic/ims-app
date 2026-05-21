// ──────────────────────────────────────────────────────────────────────────
// scripts/ingest-kb.js
// ──────────────────────────────────────────────────────────────────────────
// Re-chunks and re-embeds all site content into the kb_chunks table.
// Pulls directly from the data modules that already power the public pages
// so there's no second source of truth.
//
// Run:    node scripts/ingest-kb.js
// Cron:   add to vercel.json or a GitHub Action on a nightly schedule.
//
// Env required:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   VOYAGE_API_KEY
//   NEXT_PUBLIC_SITE_URL (optional, defaults to https://nautilusinventory.com)
//
// If you swap Voyage for OpenAI, change embedBatch() and the vector dim
// in chat-schema.sql to match (1024 → 1536 for text-embedding-3-small).
// ──────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import { getSupabaseAdmin } from "../lib/supabase.js";

// NOTE: adjust these imports if the exported names differ in your modules.
// We use a fallback (`?? []` / `?? {}`) so missing modules don't crash the
// build — you'll just see "0 chunks from <source>" in the log.
import { BLOG_POSTS } from "../lib/blogData.js";
import { HELP_CATEGORIES } from "../lib/helpData.js";
import { INTEGRATIONS } from "../components/IntegrationPage/integrationData.js";
import { INDUSTRIES } from "../components/IndustryPage/industryData.js";
import { COMPARES } from "../app/compare/[slug]/compareData.js";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://nautilusinventory.com";
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = "voyage-3";
const VOYAGE_DIM = 1024;

// Chunk-size bounds, tuned for voyage-3's context. ~1800 chars ≈ 450 tokens
// which leaves plenty of room when we stuff 6-8 chunks into Claude's context.
const MAX_CHUNK_CHARS = 1800;
const MIN_CHUNK_CHARS = 200;

// ── Helpers ──────────────────────────────────────────────────────────────

const approxTokens = (text) => Math.ceil(text.length / 4);

/* Walk a content array (the {type, text} shape used in blogData/helpData)
   and split into chunks bounded by h2 headings. Long sections get further
   split on paragraph boundaries. Each chunk carries the heading it sits
   under so retrieval results stay coherent and citable. */
function chunkContentArray(contentArr, baseTitle) {
  const chunks = [];
  let currentHeading = baseTitle;
  let buffer = "";
  let position = 0;

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length >= MIN_CHUNK_CHARS) {
      chunks.push({
        heading: currentHeading,
        content: trimmed,
        position: position++,
      });
    }
    buffer = "";
  };

  for (const block of contentArr || []) {
    if (block.type === "h2") {
      flush();
      currentHeading = block.text;
      continue;
    }
    const text = block.text || "";
    if (!text) continue;
    if ((buffer + "\n" + text).length > MAX_CHUNK_CHARS && buffer) {
      flush();
    }
    buffer = buffer ? `${buffer}\n${text}` : text;
  }
  flush();
  return chunks;
}

// ── Source builders ──────────────────────────────────────────────────────

function buildBlogChunks() {
  return (BLOG_POSTS ?? []).flatMap((post) =>
    chunkContentArray(post.content, post.title).map((c) => ({
      source_type: "blog",
      source_slug: post.slug,
      source_url: `${SITE_URL}/blog/${post.slug}`,
      title: post.title,
      ...c,
    }))
  );
}

function buildHelpChunks() {
  return (HELP_CATEGORIES ?? []).flatMap((cat) =>
    (cat.articles ?? []).flatMap((art) =>
      chunkContentArray(art.content, art.title).map((c) => ({
        source_type: "help",
        source_slug: art.slug,
        source_url: `${SITE_URL}/help/${art.slug}`,
        title: art.title,
        ...c,
      }))
    )
  );
}

function buildIntegrationChunks() {
  return Object.entries(INTEGRATIONS ?? {}).map(([slug, data]) => {
    const featureText = (data.features || [])
      .map((f) => `${f.title}: ${f.desc}`)
      .join("\n");
    return {
      source_type: "integration",
      source_slug: slug,
      source_url: `${SITE_URL}/integration/${slug}`,
      title: `${data.title} integration`,
      heading: data.tagline,
      content: `${data.desc}\n\n${featureText}`.trim(),
      position: 0,
    };
  });
}

function buildIndustryChunks() {
  return (INDUSTRIES ?? []).map((ind) => {
    const challenges = (ind.challenges || [])
      .map((c) => `Challenge — ${c.title}: ${c.desc}`)
      .join("\n");
    const solutions = (ind.solutions || [])
      .map((s) => `Solution — ${s.title}: ${s.desc}`)
      .join("\n");
    return {
      source_type: "industry",
      source_slug: ind.slug,
      source_url: `${SITE_URL}/industry/${ind.slug}`,
      title: ind.title,
      heading: null,
      content: `${ind.heroDesc}\n\n${challenges}\n\n${solutions}`.trim(),
      position: 0,
    };
  });
}

function buildCompareChunks() {
  return Object.entries(COMPARES ?? {}).map(([slug, data]) => {
    const reasons = (data.reasons || [])
      .map((r) => `${r.title}: ${r.desc}`)
      .join("\n");
    return {
      source_type: "compare",
      source_slug: slug,
      source_url: `${SITE_URL}/compare/${slug}`,
      title: `Nautilus vs ${data.competitorName || slug}`,
      heading: null,
      content:
        `${data.heroDesc}\n\nWhy teams choose Nautilus:\n${reasons}`.trim(),
      position: 0,
    };
  });
}

// ── Embedding ────────────────────────────────────────────────────────────

async function embedBatch(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: "document",
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

async function embedAll(chunks, batchSize = 64) {
  const out = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const embeds = await embedBatch(batch.map((c) => c.content));
    batch.forEach((c, idx) => {
      out.push({
        ...c,
        embedding: embeds[idx],
        token_count: approxTokens(c.content),
      });
    });
    console.log(
      `  embedded ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`
    );
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (!VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY not set");

  const supabase = getSupabaseAdmin();

  const sources = [
    ["blog", buildBlogChunks()],
    ["help", buildHelpChunks()],
    ["integration", buildIntegrationChunks()],
    ["industry", buildIndustryChunks()],
    ["compare", buildCompareChunks()],
  ];

  for (const [name, chunks] of sources) {
    console.log(`${name}: ${chunks.length} chunks`);
  }

  const all = sources.flatMap(([, chunks]) => chunks);
  console.log(`\nTotal: ${all.length} chunks. Embedding…`);

  const embedded = await embedAll(all);

  // Wipe-and-replace strategy. Small table (low thousands of rows max), so
  // a full re-insert is cheaper than per-row diffing and avoids stale chunks
  // when content gets removed upstream.
  console.log("\nClearing kb_chunks…");
  const { error: delErr } = await supabase
    .from("kb_chunks")
    .delete()
    .gte("position", 0);
  if (delErr) throw delErr;

  console.log("Inserting…");
  for (let i = 0; i < embedded.length; i += 200) {
    const batch = embedded.slice(i, i + 200);
    const { error } = await supabase.from("kb_chunks").insert(batch);
    if (error) throw error;
    console.log(
      `  inserted ${Math.min(i + 200, embedded.length)}/${embedded.length}`
    );
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
