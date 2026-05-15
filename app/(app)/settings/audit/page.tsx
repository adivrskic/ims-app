import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";

export const metadata = { title: "Audit log · Settings" };

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_type: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

const PAGE_SIZE = 30;

function actionTone(
  action: string
): "success" | "warning" | "danger" | "info" | "accent" | "neutral" {
  if (
    action.includes(".created") ||
    action.includes(".invited") ||
    action === "scan.logged" ||
    action.includes(".placed")
  )
    return "success";
  if (action.includes(".deleted") || action.includes(".revoked"))
    return "danger";
  if (
    action.includes(".updated") ||
    action.includes(".modified") ||
    action.includes(".changed")
  )
    return "warning";
  if (action.includes(".used")) return "info";
  return "neutral";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data: rows, count } = await supabase
    .from("audit_log")
    .select(
      "id, actor_id, actor_type, action, resource_type, resource_id, metadata, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Collect distinct actor ids to bulk-resolve names
  const actorIds = Array.from(
    new Set(
      (rows ?? []).map((r: AuditRow) => r.actor_id).filter(Boolean) as string[]
    )
  );
  const { data: actors } = actorIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", actorIds)
    : { data: [] };
  const actorMap = new Map(
    (actors ?? []).map(
      (a: { id: string; email: string; full_name: string | null }) => [a.id, a]
    )
  );

  return (
    <div className="flex flex-col gap-24">
      <SectionTitle
        eyebrow="History"
        title="Workspace activity"
        action={
          <span className="label-text text-text-muted">
            {count ?? 0} {(count ?? 0) === 1 ? "event" : "events"}
          </span>
        }
      />

      {!rows || rows.length === 0 ? (
        <div className="hairline bg-[var(--surface-2)] px-20 py-32 flex flex-col items-center text-center gap-8">
          <History size={18} strokeWidth={1.5} className="text-text-muted" />
          <p className="mono-sm text-text-muted">No activity recorded yet</p>
        </div>
      ) : (
        <>
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {rows.map((row: AuditRow) => {
              const actor = row.actor_id ? actorMap.get(row.actor_id) : null;
              const source =
                (row.metadata &&
                typeof row.metadata === "object" &&
                "source" in row.metadata
                  ? String(row.metadata.source)
                  : null) ??
                row.actor_type ??
                "system";
              const time = row.created_at ? new Date(row.created_at) : null;
              return (
                <li
                  key={row.id}
                  className="px-20 py-12 flex items-center gap-14 row-interactive"
                >
                  <time
                    className="mono-sm text-text-dim tnum w-[110px] shrink-0"
                    dateTime={row.created_at ?? undefined}
                  >
                    {time
                      ? `${time.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })} · ${time.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : "—"}
                  </time>
                  <Badge tone={actionTone(row.action)} variant="filled">
                    {row.action}
                  </Badge>
                  <div className="flex-1 min-w-0 flex items-center gap-10">
                    {row.resource_type && (
                      <span className="label-text text-text-muted">
                        {row.resource_type}
                      </span>
                    )}
                    {actor && (
                      <span
                        className="text-text truncate"
                        style={{ fontFamily: "var(--display)", fontSize: 12 }}
                      >
                        by {actor.full_name || actor.email?.split("@")[0]}
                      </span>
                    )}
                  </div>
                  <span className="mono-sm text-text-dim hidden md:inline">
                    via {source.replace("_", " ")}
                  </span>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav
              className="flex items-center justify-between"
              aria-label="Audit log pagination"
            >
              <Link
                href={`/settings/audit?page=${Math.max(1, page - 1)}`}
                className={`hairline-subtle px-12 py-6 inline-flex items-center gap-6 transition-colors ${
                  page === 1
                    ? "opacity-40 pointer-events-none"
                    : "hover:border-[var(--border-hover)] text-text-secondary hover:text-text"
                }`}
                aria-disabled={page === 1}
              >
                <ChevronLeft size={11} strokeWidth={1.5} />
                <span className="label-text">Previous</span>
              </Link>
              <p className="label-text text-text-muted">
                Page {page} of {totalPages}
              </p>
              <Link
                href={`/settings/audit?page=${Math.min(totalPages, page + 1)}`}
                className={`hairline-subtle px-12 py-6 inline-flex items-center gap-6 transition-colors ${
                  page >= totalPages
                    ? "opacity-40 pointer-events-none"
                    : "hover:border-[var(--border-hover)] text-text-secondary hover:text-text"
                }`}
                aria-disabled={page >= totalPages}
              >
                <span className="label-text">Next</span>
                <ChevronRight size={11} strokeWidth={1.5} />
              </Link>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
