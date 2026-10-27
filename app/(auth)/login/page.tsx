import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; revoked?: string }>;
}) {
  const { next, error, revoked } = await searchParams;

  // `/auth/signout?revoked=1` sends people here when their device session was
  // revoked from somewhere else. Nothing used to read the flag, so being signed
  // out remotely looked like the app had logged you out at random.
  const notice =
    error ??
    (revoked === "1"
      ? "You were signed out because this device's access was revoked. Sign in again to continue."
      : undefined);

  // LoginForm renders the page's one <h1>; a second heading here read as two
  // page titles to assistive tech.
  return <LoginForm next={next ?? "/"} initialError={notice} />;
}
