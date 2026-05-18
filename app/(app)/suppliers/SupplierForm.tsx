"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { PAYMENT_TERMS_OPTIONS, type PaymentTerms } from "../customers/types";
import { createSupplier, updateSupplier } from "./actions";
import type { Supplier, SupplierInput } from "./types";

interface Props {
  mode: "create" | "edit";
  initialData?: Supplier;
}

export function SupplierForm({ mode, initialData }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(initialData?.name ?? "");
  const [contactName, setContactName] = useState(
    initialData?.contact_name ?? ""
  );
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [website, setWebsite] = useState(initialData?.website ?? "");
  const [addressLine1, setAddressLine1] = useState(
    initialData?.address_line1 ?? ""
  );
  const [addressLine2, setAddressLine2] = useState(
    initialData?.address_line2 ?? ""
  );
  const [city, setCity] = useState(initialData?.city ?? "");
  const [state, setState] = useState(initialData?.state ?? "");
  const [zip, setZip] = useState(initialData?.zip ?? "");
  const [country, setCountry] = useState(initialData?.country ?? "US");
  const [taxId, setTaxId] = useState(initialData?.tax_id ?? "");
  const [accountNumber, setAccountNumber] = useState(
    initialData?.account_number ?? ""
  );
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(
    initialData?.payment_terms ?? "net_30"
  );
  const [leadTime, setLeadTime] = useState(
    initialData?.default_lead_time_days?.toString() ?? ""
  );
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const input: SupplierInput = {
      name,
      contact_name: contactName,
      email,
      phone,
      website,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city,
      state,
      zip,
      country,
      tax_id: taxId,
      account_number: accountNumber,
      payment_terms: paymentTerms,
      default_lead_time_days:
        leadTime.trim() === "" ? null : parseInt(leadTime, 10),
      notes,
    };

    startTransition(async () => {
      if (mode === "create") {
        const r = await createSupplier(input);
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.id) router.push(`/suppliers/${r.id}`);
      } else if (initialData) {
        const r = await updateSupplier(initialData.id, input);
        if (r.error) {
          setError(r.error);
          return;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-24 max-w-[720px]">
      <Section title="Identity">
        <Input
          label="Supplier name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
        />
      </Section>

      <Section title="Contact">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <Input
            label="Primary contact"
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            maxLength={200}
          />
          <Input
            label="Website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            maxLength={200}
            placeholder="https://"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
          />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={50}
          />
        </div>
      </Section>

      <Section title="Address">
        <div className="flex flex-col gap-12">
          <Input
            label="Street address"
            type="text"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            maxLength={200}
          />
          <Input
            label="Suite / unit (optional)"
            type="text"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            maxLength={200}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <div className="col-span-2">
              <Input
                label="City"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <Input
              label="State"
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
            <Input
              label="Zip"
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </div>
          <Input
            label="Country"
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
            placeholder="US"
          />
        </div>
      </Section>

      <Section title="Commercial">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <label
              className="label-text text-text-muted mb-4 block"
              htmlFor="payment-terms"
            >
              Payment terms
            </label>
            <select
              id="payment-terms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
              className="field-input w-full"
            >
              {PAYMENT_TERMS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Default lead time (days)"
            type="number"
            min="0"
            step="1"
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
            placeholder="—"
          />
          <Input
            label="Our account number"
            type="text"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            maxLength={100}
          />
          <Input
            label="Tax ID"
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            maxLength={50}
          />
        </div>
      </Section>

      <Section title="Notes">
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Shipping quirks, contacts, anything to remember…"
          className="field-input resize-none w-full"
        />
      </Section>

      {error && (
        <div
          className="hairline-subtle px-12 py-8 flex items-start gap-8"
          style={{
            background: "var(--danger-dim)",
            color: "var(--danger)",
          }}
        >
          <AlertTriangle
            size={11}
            strokeWidth={1.5}
            className="mt-2 shrink-0"
          />
          <span className="mono-sm flex-1">{error}</span>
        </div>
      )}

      <div className="flex items-center gap-12 hairline-t pt-16">
        <CornerButton
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={pending}
        >
          {pending && (
            <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
          )}
          {mode === "create" ? "Create supplier" : "Save changes"}
        </CornerButton>
        <CornerButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </CornerButton>
        {saved && (
          <span
            className="inline-flex items-center gap-6 mono-sm"
            style={{ color: "var(--success)" }}
          >
            <Check size={11} strokeWidth={1.5} />
            <span>Saved</span>
          </span>
        )}
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-12">
      <h3
        className="label-text text-text-muted hairline-b pb-8"
        style={{ letterSpacing: "0.8px" }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}
