import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CornerButton } from "@/components/ui/CornerButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Webhook, Plus } from "lucide-react";

export const metadata = { title: "Webhooks · Settings" };

interface WebhookRow {
  id: string;
  url: string;
  description: string | null;
  events: string[] | null;
  is_active: boolean;
  created_at: string | null;
  last_delivery_at: string | null;
}

const AVAILABLE_EVENTS = [
  "scan.logged",
  "product.created",
  "product.updated",
  "location.placed",
  "order.created",
  "order.fulfilled",
  "po.received",
  "stock.low",
];

export default async function WebhooksPage() {
  const supabase = await createClient();
  const { data: endpoints } = await supabase
    .from("webhook_endpoints")
    .select(
      "id, url, description, events, is_active, created_at, last_delivery_at"
    )
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-40">
      <section aria-labelledby="endpoints">
        <SectionTitle
          eyebrow="Delivery"
          title="Endpoints"
          action={
            <CornerButton variant="primary" size="sm" disabled>
              <Plus size={11} strokeWidth={1.5} />
              Add endpoint
            </CornerButton>
          }
        />
        {!endpoints || endpoints.length === 0 ? (
          <EmptyState
            title="No webhook endpoints"
            description="Receive real-time HTTPS POST notifications when scans, products, orders, and stock events happen in your workspace. Endpoints retry with exponential backoff and every delivery is logged."
            icon={<Webhook size={20} strokeWidth={1.5} />}
            action={
              <CornerButton variant="ghost" size="sm" disabled>
                Add your first endpoint
              </CornerButton>
            }
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {endpoints.map((e: WebhookRow) => (
              <li
                key={e.id}
                className="px-20 py-14 flex items-center gap-14 row-interactive"
              >
                <span
                  className={`dot ${
                    e.is_active ? "dot-online" : "dot-offline"
                  }`}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-text truncate"
                    style={{ fontFamily: "var(--mono)", fontSize: 12 }}
                  >
                    {e.url}
                  </p>
                  <p className="mono-sm text-text-muted">
                    {(e.events ?? []).length} events ·{" "}
                    {e.last_delivery_at
                      ? `Last delivery ${new Date(
                          e.last_delivery_at
                        ).toLocaleDateString()}`
                      : "Never delivered"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="events">
        <SectionTitle eyebrow="Catalog" title="Available events" />
        <div className="hairline bg-[var(--surface)] p-20">
          <p className="mono-sm text-text-muted mb-14">
            Subscribe an endpoint to any combination of these events. Each
            delivery includes a signed JWT in the{" "}
            <code className="text-text">X-Nimbus-Signature</code> header.
          </p>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-16 gap-y-8">
            {AVAILABLE_EVENTS.map((evt) => (
              <li
                key={evt}
                className="flex items-center gap-8 text-text-secondary"
              >
                <span className="dot dot-offline" aria-hidden />
                <code className="mono-sm" style={{ fontSize: 11 }}>
                  {evt}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
