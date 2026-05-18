import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Truck,
  Mail,
  Phone,
  Globe,
  User,
  MapPin,
  CreditCard,
  Clock,
  Hash,
  FileText,
} from "lucide-react";
import { CornerLink } from "@/components/ui/CornerButton";
import { paymentTermsLabel } from "../customers/types";
import { getSupplier } from "../actions";
import { SupplierActiveToggle } from "./SupplierActiveToggle";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await getSupplier(id);
  if (r.error || !r.supplier) notFound();
  const s = r.supplier;
  const recent = r.recentPOs ?? [];
  const stats = r.stats ?? { poCount: 0 };

  const addressLines = [
    s.address_line1,
    s.address_line2,
    [s.city, s.state, s.zip].filter(Boolean).join(", "),
    s.country && s.country !== "US" ? s.country : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <header className="hairline-b pb-12 mb-20 flex items-center gap-14 flex-wrap">
        <Link
          href="/suppliers"
          className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={11} strokeWidth={1.5} />
          <span className="label-text">Suppliers</span>
        </Link>
        <span
          className="h-14 w-px bg-[var(--border-subtle)] hidden sm:inline-block"
          aria-hidden
        />
        <div className="flex items-baseline gap-8 min-w-0">
          <span
            className="w-22 h-22 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)]"
            aria-hidden
          >
            <Truck size={11} strokeWidth={1.5} />
          </span>
          <h1
            className="text-text truncate"
            style={{
              fontFamily: "var(--display)",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            {s.name}
          </h1>
          {s.contact_name && (
            <span
              className="text-text-muted truncate hidden md:inline"
              style={{ fontFamily: "var(--mono)", fontSize: 12 }}
            >
              · {s.contact_name}
            </span>
          )}
          {!s.is_active && (
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
        </div>
        <div className="ml-auto flex items-center gap-10">
          <SupplierActiveToggle
            supplierId={s.id}
            isActive={s.is_active}
          />
          <CornerLink
            href={`/suppliers/${s.id}/edit`}
            variant="primary"
            size="sm"
          >
            <Pencil size={11} strokeWidth={1.5} />
            Edit
          </CornerLink>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
        <div className="lg:col-span-2 flex flex-col gap-14">
          <Card title="Contact">
            <Field icon={User} label="Primary contact" value={s.contact_name} />
            <Field icon={Mail} label="Email" value={s.email} />
            <Field icon={Phone} label="Phone" value={s.phone} />
            <Field
              icon={Globe}
              label="Website"
              value={s.website}
              href={s.website ?? undefined}
            />
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
              value={paymentTermsLabel(s.payment_terms)}
            />
            <Field
              icon={Clock}
              label="Default lead time"
              value={
                s.default_lead_time_days !== null
                  ? `${s.default_lead_time_days} days`
                  : null
              }
            />
            <Field
              icon={Hash}
              label="Our account #"
              value={s.account_number}
            />
            <Field icon={FileText} label="Tax ID" value={s.tax_id} />
          </Card>

          {s.notes && (
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
                {s.notes}
              </p>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-14">
          <Card title={`Purchase orders (${stats.poCount})`}>
            {recent.length === 0 ? (
              <p
                className="mono-sm text-text-dim"
                style={{ lineHeight: 1.6 }}
              >
                No POs yet. New purchase orders linked to this supplier
                will appear here.
              </p>
            ) : (
              <ul className="flex flex-col -mx-14">
                {recent.map((po, i) => (
                  <li
                    key={po.id}
                    className={i === 0 ? "" : "hairline-t"}
                  >
                    <Link
                      href={`/purchase-orders/${po.id}`}
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
                          {po.po_number || "Draft PO"}
                        </span>
                        <span
                          className="text-text-dim"
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 9,
                          }}
                        >
                          {poStatusLabel(po.status)}
                          {po.expected_date && (
                            <> · Expected {formatShortDate(po.expected_date)}</>
                          )}
                        </span>
                      </div>
                      <span
                        className="text-text-dim shrink-0 tnum"
                        style={{ fontFamily: "var(--mono)", fontSize: 9 }}
                      >
                        {formatShortDate(po.created_at)}
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
  href,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: string | null;
  multiline?: boolean;
  href?: string;
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
          href ? (
            
              href={href.startsWith("http") ? href : `https://${href}`}
              target="_blank"
              rel="noreferrer"
              className="text-text hover:text-[var(--accent)] transition-colors truncate"
              style={{ fontFamily: "var(--mono)", fontSize: 11 }}
            >
              {value}
            </a>
          ) : (
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
          )
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

function poStatusLabel(s: string): string {
  switch (s) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "partially_received":
      return "Partial";
    case "fully_received":
      return "Received";
    case "cancelled":
      return "Cancelled";
    default:
      return s;
  }
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}