/*
 * Download a starter CSV with the expected team-import columns.
 * Linked from the bulk-invite modal as "Download template".
 */
export async function GET() {
  const lines = [
    "email,role,full_name,phone,facility",
    "owner@example.com,owner,Sample Owner (delete this row),555-0100,Main Warehouse",
    "ops-lead@example.com,admin,Operations Lead,555-0101,Main Warehouse",
    "operator@example.com,member,Floor Operator,555-0102,",
  ];
  const csv = lines.join("\r\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="Nautilus-team-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
