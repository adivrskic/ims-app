"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const US_STATES: { value: string; label: string }[] = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

interface Props {
  /**
   * Field-name prefix. Non-empty → `${namePrefix}_city` / `_state` / `_zip`
   * (e.g. "facility" → facility_city). Empty string → bare `city` / `state`
   * / `zip`. Defaults to "facility".
   */
  namePrefix?: string;
  initialCity?: string;
  initialState?: string;
  initialZip?: string;
}

/**
 * City / State / ZIP block.
 *
 * - State is a searchable dropdown of US states (value = 2-letter abbr).
 * - ZIP is digits only, five max. (A ZIP → city/state lookup against a
 *   third-party API used to live here; the CSP's connect-src only allows
 *   our own origin and Supabase, so it never ran. Manual entry only.)
 *
 * Submits via the standard field names so server actions need no changes.
 */
export function AddressFields({
  namePrefix = "facility",
  initialCity = "",
  initialState = "",
  initialZip = "",
}: Props) {
  const [city, setCity] = useState(initialCity);
  const [state, setState] = useState(initialState);
  const [zip, setZip] = useState(initialZip);

  const fieldName = (f: "city" | "state" | "zip") =>
    namePrefix ? `${namePrefix}_${f}` : f;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
      <Input
        label="City"
        name={fieldName("city")}
        type="text"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="Atlanta"
        autoComplete="address-level2"
      />
      <Select
        label="State"
        name={fieldName("state")}
        value={state}
        onChange={setState}
        options={US_STATES}
        searchable
      />
      <Input
        label="ZIP"
        name={fieldName("zip")}
        type="text"
        inputMode="numeric"
        maxLength={5}
        value={zip}
        onChange={(e) =>
          setZip(e.target.value.replace(/[^\d]/g, "").slice(0, 5))
        }
        placeholder="30309"
        autoComplete="postal-code"
      />
    </div>
  );
}
