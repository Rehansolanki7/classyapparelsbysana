"use client";

import Link from "next/link";
import { useState } from "react";

export default function AdminLoginClient({ returnTo }: { returnTo: string }) {
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/admin/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessKey }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(result.error || "That admin access key is not correct");
      setBusy(false);
      return;
    }
    // Use a full navigation after the server sets the HTTP-only session cookie.
    // A router replace plus an immediate refresh can race on proxied hosts and
    // leave the user on this same sign-in page.
    window.location.assign(returnTo);
  }

  return <main className="auth-page"><Link className="checkout-wordmark" href="/"><span>Classy Apparels</span></Link><section className="auth-card"><p className="kicker">Private workspace</p><h1>Administrator sign in</h1><p>Enter the private admin access key to open the shop dashboard.</p><form onSubmit={signIn}><label><span>Admin access key</span><input type="password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} autoComplete="current-password" required disabled={busy} /></label>{notice && <p className="auth-notice" role="status">{notice}</p>}<button className="button button-dark" disabled={busy}>{busy ? "Signing in…" : "Open admin dashboard"}</button></form><div className="auth-links"><Link href="/login">Customer sign in</Link><Link href="/">Return to shop</Link></div></section></main>;
}
