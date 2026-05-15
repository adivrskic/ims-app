import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="flex flex-col gap-28">
      <h1 className="heading-sm">Sign in</h1>
      <LoginForm next={next ?? "/"} initialError={error} />
    </div>
  );
}
