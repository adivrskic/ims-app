export type CustomerType = "individual" | "business";
export type PaymentTerms =
  | "cod"
  | "due_on_receipt"
  | "net_15"
  | "net_30"
  | "net_60"
  | "net_90";

export interface Customer {
  id: string;
  name: string;
  company_name: string | null;
  customer_type: CustomerType;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  tax_id: string | null;
  credit_limit: number | null;
  payment_terms: PaymentTerms;
  discount_percent: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerInput {
  name: string;
  company_name?: string | null;
  customer_type: CustomerType;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  tax_id?: string | null;
  credit_limit?: number | null;
  payment_terms: PaymentTerms;
  discount_percent: number;
  notes?: string | null;
  is_active?: boolean;
}

export const PAYMENT_TERMS_OPTIONS: { value: PaymentTerms; label: string }[] = [
  { value: "cod", label: "COD (Cash on delivery)" },
  { value: "due_on_receipt", label: "Due on receipt" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
];

export function paymentTermsLabel(t: PaymentTerms | string): string {
  return PAYMENT_TERMS_OPTIONS.find((o) => o.value === t)?.label ?? String(t);
}
