"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

/**
 * Common return shape for auth server actions used with useActionState.
 * Either `error` or `success` is set; never both.
 */
export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Canonical useActionState signature: (prevState, formData) => ActionState.
 *
 * Critical to match this exactly when used with React 19's useActionState
 * — the wrapper-function pattern (taking only formData) drops the FormData
 * over the wire and fails with "Cannot read properties of undefined".
 */
export async function signInWithPassword(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!email) return { error: "Email is required" };
  if (!password) return { error: "Password is required" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  // Successful sign-in — redirect to wherever the user was headed.
  // redirect() throws a special exception that Next.js catches, so this
  // doesn't return — the function exits here.
  redirect(next);
}

export async function signUpWithPassword(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email) return { error: "Email is required" };
  if (!password) return { error: "Password is required" };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null },
    },
  });
  if (error) return { error: error.message };

  // If email confirmation is required, the user can't sign in yet.
  // Return a success message instructing them to check their inbox.
  if (data.user && !data.session) {
    return {
      success: `Check ${email} — we sent a confirmation link to verify your account.`,
    };
  }

  // If sessions are auto-created (email confirmation disabled in
  // Supabase settings), the trigger / signup hook should have created
  // a default org. Redirect to overview.
  redirect("/");
}

export async function sendPasswordReset(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required" };

  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? "";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/settings/security`,
  });

  // For privacy, always return the same success message regardless of
  // whether the email exists. Don't leak whether an account is registered.
  if (error) {
    // Log the real error for diagnostics; don't surface to user.
    console.error("sendPasswordReset:", error);
  }

  return {
    success: `If ${email} is registered, we've sent a reset link.`,
  };
}

export async function sendMagicLink(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/") || "/";
  if (!email) return { error: "Email is required" };

  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? "";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
        next
      )}`,
    },
  });

  if (error) {
    console.error("sendMagicLink:", error);
  }

  return {
    success: `Check ${email} for your sign-in link.`,
  };
}

/**
 * OAuth sign-in via Google. Used as a plain form action (not via
 * useActionState) since it redirects out to Google instead of returning
 * state. Form signature: (formData: FormData) => Promise<void>.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = String(formData.get("next") ?? "/") || "/";
  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? "";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // OAuth init failed — bounce back to login with the error in URL
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  if (data.url) {
    redirect(data.url);
  }
}

/**
 * Sign out — clears the Supabase session cookie + redirects to /login.
 * Used as plain form action from the user menu.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
