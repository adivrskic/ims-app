import type { PaymentTerms } from "../customers/types";

export type { PaymentTerms };

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  tax_id: string | null;
  account_number: string | null;
  payment_terms: PaymentTerms;
  default_lead_time_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierInput {
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  tax_id?: string | null;
  account_number?: string | null;
  payment_terms: PaymentTerms;
  default_lead_time_days?: number | null;
  notes?: string | null;
  is_active?: boolean;
}
