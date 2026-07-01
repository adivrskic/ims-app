"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { safeNext } from "@/lib/auth/safe-redirect";

/**
 * Common return shape for auth server actions used with useActionState.
 * Either `error` or `success` is set; never both.
 */
export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Classify Supabase auth errors into friendlier copy. The default error
 * messages from Supabase are technically accurate but unfriendly — and
 * rate-limit responses look like ordinary auth failures unless you read
 * the status code. This wraps both so the user sees something useful.
 */
function friendlyAuthError(err: { message?: string; status?: number }): string {
  const msg = (err.message ?? "").toLowerCase();
  const status = err.status ?? 0;

  // Rate limits — Supabase uses 429, and the message usually contains
  // "rate" or "too many" or "for security purposes".
  if (
    status === 429 ||
    msg.includes("rate limit") ||
    msg.includes("too many") ||
    msg.includes("for security purposes")
  ) {
    return "Too many attempts. Wait a minute and try again.";
  }

  // Email/password mismatch — Supabase says "Invalid login credentials".
  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid credentials")
  ) {
    return "That email and passcode don't match our records.";
  }

  // Email confirmation pending.
  if (msg.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox for the link we sent.";
  }

  // Account exists but signup was attempted again.
  if (
    msg.includes("user already registered") ||
    msg.includes("already been registered")
  ) {
    return "That email is already registered. Try signing in instead.";
  }

  // Weak password rejected server-side (Supabase enforces its own minimum
  // when password protection is enabled).
  if (msg.includes("password should be") || msg.includes("weak password")) {
    return "That passcode is too weak. Mix in a number, a symbol, or more length.";
  }

  // Fall back to the raw message — better than swallowing it.
  return err.message ?? "Something went wrong. Try again.";
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
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (!email) return { error: "Email is required" };
  if (!password) return { error: "Password is required" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyAuthError(error) };

  // Successful sign-in — redirect to wherever the user was headed (validated
  // same-origin path only). redirect() throws a special exception that Next.js
  // catches, so this doesn't return — the function exits here.
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
  if (error) return { error: friendlyAuthError(error) };

  // If email confirmation is required, the user can't sign in yet.
  // Return a success message instructing them to check their inbox.
  if (data.user && !data.session) {
    return {
      success: `Check ${email} — we sent a confirmation link to verify your account.`,
    };
  }

  // If sessions are auto-created (email confirmation disabled in
  // Supabase settings), they land on /onboarding so they can create
  // their workspace + first facility. The (app)/layout guard would
  // bounce them there anyway, but redirecting directly avoids a flash.
  redirect("/onboarding");
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
  const next = safeNext(String(formData.get("next") ?? "/"));
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
  const next = safeNext(String(formData.get("next") ?? "/"));
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
