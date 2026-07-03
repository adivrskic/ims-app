/**
 * Reason options for a desk-created return (stored in returns.reason text).
 * Lives outside orders/actions.ts because "use server" modules may only
 * export async functions; both the CreateReturnForm client component and the
 * createReturnFromOrder action import from here.
 */
export const RETURN_REASONS = [
  { value: "damaged_in_transit", label: "Damaged in transit" },
  { value: "wrong_item", label: "Wrong item shipped" },
  { value: "customer_return", label: "Customer return" },
  { value: "over_pull", label: "Over-pull / not needed" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "other", label: "Other" },
] as const;
