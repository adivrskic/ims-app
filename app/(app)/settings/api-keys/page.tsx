import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CornerButton } from "@/components/ui/CornerButton";
import { CreateKeyForm } from "./CreateKeyForm";
import { revokeApiKey } from "../actions";
import { KeyRound } from "lucide-react";

export const metadata = { title: "API keys · Settings" };

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[] | null;
  last_used_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function EndpointRow({
  method,
  path,
  desc,
}: {
  method: string;
  path: string;
  desc: string;
}) {
  return (
    <li className="flex items-center gap-10 flex-wrap">
      <span
        className="hairline-subtle px-6 py-2 label-text text-[var(--accent)]"
        style={{ fontSize: 9 }}
      >
        {method}
      </span>
      <code className="mono-sm text-text-secondary" style={{ fontSize: 12 }}>
        {path}
      </code>
      <span className="mono-sm text-text-dim">{desc}</span>
    </li>
  );
}

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const { data: keys } = await supabase
    .from("api_keys")
    .select(
      "id, name, key_prefix, scopes, last_used_at, created_at, revoked_at"
    )
    .order("created_at", { ascending: false });

  const active = (keys ?? []).filter((k: ApiKeyRow) => !k.revoked_at);
  const revoked = (keys ?? []).filter((k: ApiKeyRow) => k.revoked_at);

  return (
    <div className="flex flex-col gap-40">
      <CreateKeyForm />

      <section aria-labelledby="active-keys">
        <SectionTitle
          eyebrow="Live"
          title="Active keys"
          action={
            <span className="label-text text-text-muted">
              {active.length} {active.length === 1 ? "key" : "keys"}
            </span>
          }
        />
        {active.length === 0 ? (
          <div className="hairline bg-[var(--surface-2)] px-20 py-32 flex flex-col items-center text-center gap-8">
            <KeyRound size={18} strokeWidth={1.5} className="text-text-muted" />
            <p className="mono-sm text-text-muted">No active keys</p>
          </div>
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {active.map((k: ApiKeyRow) => (
              <li
                key={k.id}
                className="px-20 py-14 flex items-center gap-14 row-interactive"
              >
                <span
                  className="w-28 h-28 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)]"
                  aria-hidden
                >
                  <KeyRound size={12} strokeWidth={1.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-text truncate"
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {k.name}
                  </p>
                  <div className="flex items-center gap-12 mono-sm text-text-muted">
                    <code style={{ fontSize: 11 }}>
                      {k.key_prefix}_••••••••
                    </code>
                    <span>·</span>
                    <span>{(k.scopes ?? []).length} scopes</span>
                  </div>
                </div>
                <div className="hidden md:flex flex-col items-end gap-2 w-[140px]">
                  <span className="label-text text-text-muted">Last used</span>
                  <span className="mono-sm text-text-secondary">
                    {timeAgo(k.last_used_at)}
                  </span>
                </div>
                <form action={revokeApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <CornerButton
                    type="submit"
                    variant="danger"
                    size="sm"
                    ariaLabel={`Revoke ${k.name}`}
                  >
                    Revoke
                  </CornerButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="endpoints">
        <SectionTitle eyebrow="Reference" title="Endpoints" />
        <div className="hairline bg-[var(--surface)] px-20 py-16 flex flex-col gap-10">
          <p className="mono-sm text-text-muted">
            Authenticate with{" "}
            <code className="text-text-secondary">
              Authorization: Bearer &lt;key&gt;
            </code>
            . A request must satisfy both gates: the key needs the endpoint&apos;s
            scope, and the member who created it must still hold the matching
            permission. A missing scope returns 403 naming the scope required.
          </p>
          <ul className="flex flex-col gap-6">
            <EndpointRow
              method="GET"
              path="/api/v1/products"
              desc="List the catalog — scope product:read"
            />
            <EndpointRow
              method="GET"
              path="/api/v1/inventory"
              desc="On-hand per product (?warehouse_id= optional) — scope location:read"
            />
            <EndpointRow
              method="POST"
              path="/api/v1/scans"
              desc="Log a scan — scope scan:write + inventory.adjust"
            />
          </ul>
        </div>
      </section>

      {revoked.length > 0 && (
        <section aria-labelledby="revoked-keys">
          <SectionTitle
            eyebrow="Archive"
            title="Revoked"
            action={
              <span className="label-text text-text-muted">
                {revoked.length} {revoked.length === 1 ? "key" : "keys"}
              </span>
            }
          />
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {revoked.map((k: ApiKeyRow) => (
              <li
                key={k.id}
                className="px-20 py-14 flex items-center gap-14 opacity-55"
              >
                <span
                  className="w-28 h-28 hairline-subtle bg-[var(--surface-2)] flex items-center justify-center shrink-0 text-text-dim"
                  aria-hidden
                >
                  <KeyRound size={12} strokeWidth={1.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-text-muted truncate"
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {k.name}
                  </p>
                  <code
                    className="mono-sm text-text-dim"
                    style={{ fontSize: 11 }}
                  >
                    {k.key_prefix}_••••••••
                  </code>
                </div>
                <span className="mono-sm text-text-dim">
                  Revoked {timeAgo(k.revoked_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
