import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Pencil,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Tag,
  FileText,
} from "lucide-react";
import { CornerLink } from "@/components/ui/CornerButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCustomer } from "../actions";
import { paymentTermsLabel } from "../types";
import { CustomerActiveToggle } from "./CustomerActiveToggle";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await getCustomer(id);
  if (r.error || !r.customer) notFound();
  const c = r.customer;
  const recent = r.recentOrders ?? [];
  const stats = r.stats ?? { orderCount: 0 };

  const addressLines = [
    c.address_line1,
    c.address_line2,
    [c.city, c.state, c.zip].filter(Boolean).join(", "),
    c.country && c.country !== "US" ? c.country : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        backHref="/customers"
        backLabel="Customers"
        eyebrow={c.customer_type === "business" ? "Business" : "Individual"}
        title={c.name}
        description={c.company_name || undefined}
        actions={
          <>
            {!c.is_active && (
              <span
                className="hairline-subtle px-8 py-2 shrink-0 text-text-dim"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                Inactive
              </span>
            )}
            <CustomerActiveToggle customerId={c.id} isActive={c.is_active} />
            <CornerLink
              href={`/customers/${c.id}/edit`}
              variant="primary"
              size="sm"
            >
              <Pencil size={11} strokeWidth={1.5} />
              Edit
            </CornerLink>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
        <div className="lg:col-span-2 flex flex-col gap-14">
          <Card title="Contact">
            <Field icon={Mail} label="Email" value={c.email} />
            <Field icon={Phone} label="Phone" value={c.phone} />
          </Card>

          <Card title="Address">
            <Field
              icon={MapPin}
              label="Mailing address"
              value={addressLines.length ? addressLines.join("\n") : null}
              multiline
            />
          </Card>

          <Card title="Commercial">
            <Field
              icon={CreditCard}
              label="Payment terms"
              value={paymentTermsLabel(c.payment_terms)}
            />
            <Field
              icon={CreditCard}
              label="Credit limit"
              value={
                c.credit_limit !== null
                  ? `$${Number(c.credit_limit).toLocaleString()}`
                  : "No limit"
              }
            />
            <Field
              icon={Tag}
              label="Discount"
              value={c.discount_percent > 0 ? `${c.discount_percent}%` : "None"}
            />
            <Field icon={FileText} label="Tax ID" value={c.tax_id} />
          </Card>

          {c.notes && (
            <Card title="Notes">
              <p
                className="text-text"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {c.notes}
              </p>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-14">
          <Card title={`Orders (${stats.orderCount})`}>
            {recent.length === 0 ? (
              <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
                No orders yet. New orders linked to this customer will appear
                here.
              </p>
            ) : (
              <ul className="flex flex-col -mx-14">
                {recent.map((o, i) => (
                  <li key={o.id} className={i === 0 ? "" : "hairline-t"}>
                    <Link
                      href={`/orders/${o.id}`}
                      className="flex items-center gap-8 px-14 py-10 hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <div className="flex flex-col gap-2 min-w-0 flex-1">
                        <span
                          className="text-text truncate"
                          style={{
                            fontFamily: "var(--display)",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {o.order_number || "Untitled order"}
                        </span>
                        <span
                          className="text-text-dim"
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 9,
                          }}
                        >
                          {orderTypeLabel(o.order_type)} ·{" "}
                          {statusLabel(o.status)}
                        </span>
                      </div>
                      <span
                        className="text-text-dim shrink-0 tnum"
                        style={{ fontFamily: "var(--mono)", fontSize: 9 }}
                      >
                        {formatShortDate(o.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hairline bg-[var(--surface)] p-14 flex flex-col gap-8">
      <h2
        className="label-text text-text-muted hairline-b pb-8"
        style={{ letterSpacing: "0.8px" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  multiline,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="flex gap-10 items-start py-2">
      <span className="text-text-dim mt-1 shrink-0" aria-hidden>
        <Icon size={11} strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span
          className="text-text-dim"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {value ? (
          <span
            className="text-text"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              whiteSpace: multiline ? "pre-wrap" : undefined,
            }}
          >
            {value}
          </span>
        ) : (
          <span
            className="text-text-dim"
            style={{ fontFamily: "var(--mono)", fontSize: 11 }}
          >
            —
          </span>
        )}
      </div>
    </div>
  );
}

function orderTypeLabel(t: string): string {
  switch (t) {
    case "installer_job":
      return "Installer job";
    case "customer_pickup":
      return "Pickup";
    case "internal_transfer":
      return "Transfer";
    case "restock":
      return "Restock";
    default:
      return t;
  }
}

function statusLabel(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}
