"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, User, Building2 } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createCustomer, updateCustomer } from "./actions";
import {
  PAYMENT_TERMS_OPTIONS,
  type Customer,
  type CustomerInput,
  type CustomerType,
  type PaymentTerms,
} from "./types";

interface Props {
  mode: "create" | "edit";
  initialData?: Customer;
}

export function CustomerForm({ mode, initialData }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [customerType, setCustomerType] = useState<CustomerType>(
    initialData?.customer_type ?? "individual"
  );
  const [name, setName] = useState(initialData?.name ?? "");
  const [companyName, setCompanyName] = useState(
    initialData?.company_name ?? ""
  );
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
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
  const [creditLimit, setCreditLimit] = useState(
    initialData?.credit_limit?.toString() ?? ""
  );
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(
    initialData?.payment_terms ?? "net_30"
  );
  const [discountPercent, setDiscountPercent] = useState(
    initialData?.discount_percent?.toString() ?? "0"
  );
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const input: CustomerInput = {
      name,
      company_name: customerType === "business" ? companyName : null,
      customer_type: customerType,
      email,
      phone,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city,
      state,
      zip,
      country,
      tax_id: taxId,
      credit_limit: creditLimit.trim() === "" ? null : parseFloat(creditLimit),
      payment_terms: paymentTerms,
      discount_percent: parseFloat(discountPercent) || 0,
      notes,
    };

    startTransition(async () => {
      if (mode === "create") {
        const r = await createCustomer(input);
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.id) router.push(`/customers/${r.id}`);
      } else if (initialData) {
        const r = await updateCustomer(initialData.id, input);
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
        <div className="flex gap-8">
          <TypeButton
            active={customerType === "individual"}
            onClick={() => setCustomerType("individual")}
            icon={User}
            label="Individual"
          />
          <TypeButton
            active={customerType === "business"}
            onClick={() => setCustomerType("business")}
            icon={Building2}
            label="Business"
          />
        </div>
        <div className="flex flex-col gap-12">
          <Input
            label={customerType === "business" ? "Contact name" : "Full name"}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />
          {customerType === "business" && (
            <Input
              label="Company name"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              maxLength={200}
            />
          )}
        </div>
      </Section>

      <Section title="Contact">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
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
            label="Apartment / unit (optional)"
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
          <Select
            label="Payment terms"
            value={paymentTerms}
            onChange={(v) => setPaymentTerms(v as PaymentTerms)}
            options={PAYMENT_TERMS_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
          />
          <Input
            label="Tax ID"
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            maxLength={50}
          />
          <Input
            label="Credit limit ($)"
            type="number"
            min="0"
            step="0.01"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder="No limit"
          />
          <Input
            label="Discount (%)"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
          />
        </div>
      </Section>

      <Section title="Notes">
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to remember about this customer…"
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
          {mode === "create" ? "Create customer" : "Save changes"}
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

function TypeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hairline-subtle px-14 py-10 flex items-center gap-8 transition-colors flex-1 ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
          : "hover:border-[var(--border-hover)] text-text-secondary hover:text-text"
      }`}
    >
      <Icon size={12} strokeWidth={1.5} />
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </button>
  );
}
