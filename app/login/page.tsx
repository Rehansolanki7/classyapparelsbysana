import LoginClient from "./login-client";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ return_to?: string; mode?: string }> }) {
  const params = await searchParams;
  const returnTo = params.return_to?.startsWith("/") && !params.return_to.startsWith("//") ? params.return_to : "/account";
  return <LoginClient returnTo={returnTo} recovery={params.mode === "recovery"} />;
}
