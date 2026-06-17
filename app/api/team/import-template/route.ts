import { getCurrentOrgContext } from "@/lib/data/user";

export const dynamic = "force-dynamic";

/**
 * CSV template for the team bulk-invite flow. Columns mirror what
 * BulkInviteButton parses: email + role are required; full_name, phone, and
 * facility are optional.
 */
export async function GET() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const header = ["email", "role", "full_name", "phone", "facility"];
  const examples = [
    ["jordan@example.com", "member", "Jordan Lee", "(555) 010-2233", ""],
    ["sam@example.com", "admin", "Sam Rivera", "", "Main warehouse"],
  ];
  const csv = [header, ...examples].map((r) => r.join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="team-invite-template.csv"',
    },
  });
}
