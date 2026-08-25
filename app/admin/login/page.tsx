import AdminLoginClient from "./admin-login-client";

export const metadata = { title: "Administrator sign in", robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const params = await searchParams;
  void params;
  return <AdminLoginClient returnTo="/admin" />;
}
