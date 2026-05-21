import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in → go to signup (not login — onboarding implies new user).
  if (!user) redirect("/signup");

  // Already a member of an org → no onboarding needed, bounce to overview.
  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1);

  if (memberships && memberships.length > 0) {
    redirect("/");
  }

  // Pull the full name from profile (or auth user metadata) to greet them
  // and pre-fill the form's "your name" hint without making them retype.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const fullName =
    profile?.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    null;

  return <OnboardingForm fullName={fullName} email={user.email ?? ""} />;
}
