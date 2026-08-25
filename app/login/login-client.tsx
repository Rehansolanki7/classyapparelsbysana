"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginClient({ returnTo, recovery }: { returnTo: string; recovery: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const purpose = recovery ? "recovery" : "sign_in";

  async function sendCode() {
    setBusy(true); setNotice("");
    const response = await fetch("/api/auth/request-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, purpose }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) setNotice(result.error || "We could not send a code");
    else { setSent(true); setNotice(`A 6-digit code was sent to ${email.trim().toLowerCase()}.`); }
    setBusy(false);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    const response = await fetch("/api/auth/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code, purpose }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) { setNotice(result.error || "We could not verify that code"); setBusy(false); return; }
    // Let the browser make a new request only after it has stored the
    // HTTP-only session cookie returned by the verification endpoint.
    window.location.assign(returnTo);
  }

  return <main className="auth-page"><Link className="checkout-wordmark" href="/"><span>Classy Apparels</span></Link><section className="auth-card"><p className="kicker">{recovery ? "Account recovery" : "Welcome back"}</p><h1>{recovery ? "Recover your account" : "Sign in with email"}</h1><p>We use a one-time email code — no password to remember or reset.</p><form onSubmit={verify}><label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={busy} /></label>{sent && <label><span>6-digit code</span><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" required disabled={busy} /></label>}{notice && <p className="auth-notice" role="status">{notice}</p>}{sent ? <button className="button button-dark" disabled={busy}>{busy ? "Verifying…" : "Verify and continue"}</button> : <button type="button" className="button button-dark" onClick={sendCode} disabled={busy || !email}>{busy ? "Sending…" : "Email me a code"}</button>}</form><div className="auth-links">{sent && <button type="button" onClick={sendCode} disabled={busy}>Send another code</button>}<Link href={recovery ? "/login" : `/login?mode=recovery&return_to=${encodeURIComponent(returnTo)}`}>{recovery ? "Back to sign in" : "Trouble signing in?"}</Link></div></section></main>;
}
