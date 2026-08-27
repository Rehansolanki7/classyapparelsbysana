"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandLogo from "../../components/brand-logo";

export default function AdminLoginClient({ returnTo }: { returnTo: string }) {
  const [accessKey, setAccessKey] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"access-key" | "pin">("access-key");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (!resendSeconds) return;
    const timer = window.setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function requestPin() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/auth/request-pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessKey }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setNotice(result.error || "We could not begin administrator verification.");
        return;
      }
      setStep("pin");
      setPin("");
      setResendSeconds(60);
      setNotice("A six-digit verification PIN has been sent to the owner mailbox.");
    } catch {
      setNotice("We could not begin administrator verification. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function beginVerification(event: React.FormEvent) {
    event.preventDefault();
    void requestPin();
  }

  async function verifyPin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/auth/verify-pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessKey, code: pin }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setNotice(result.error || "We could not verify administrator access.");
        return;
      }
      // Use a full navigation after the server sets the HTTP-only session cookie.
      // A router replace plus an immediate refresh can race on proxied hosts and
      // leave the user on this same sign-in page.
      window.location.assign(returnTo);
    } catch {
      setNotice("We could not verify administrator access. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    if (busy) return;
    setAccessKey("");
    setPin("");
    setStep("access-key");
    setNotice("");
    setResendSeconds(0);
  }

  const isPinStep = step === "pin";

  return <main className="auth-page"><BrandLogo variant="stacked" className="auth-brand" priority /><section className="auth-card"><p className="kicker">Private workspace</p><h1>Administrator sign in</h1>{isPinStep
    ? <p>Enter the six-digit PIN sent to the owner mailbox. It expires after 10 minutes and works only with the access key you just provided.</p>
    : <p>First, enter the private Admin access key. We will then send a one-time PIN to the configured owner mailbox.</p>}
    {isPinStep
      ? <form onSubmit={verifyPin}><label><span>Owner mailbox PIN</span><input type="text" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} autoFocus /></label>{notice && <p className="auth-notice" role="status">{notice}</p>}<button className="button button-dark" disabled={busy || pin.length !== 6}>{busy ? "Verifying…" : "Verify and open dashboard"}</button><div className="auth-inline-actions"><button type="button" className="text-link" onClick={() => void requestPin()} disabled={busy || resendSeconds > 0}>{resendSeconds ? `Resend PIN in ${resendSeconds}s` : "Resend PIN"}</button><button type="button" className="text-link" onClick={startOver} disabled={busy}>Use a different key</button></div></form>
      : <form onSubmit={beginVerification}><label><span>Admin access key</span><input type="password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} autoComplete="current-password" required disabled={busy} /></label>{notice && <p className="auth-notice" role="status">{notice}</p>}<button className="button button-dark" disabled={busy}>{busy ? "Sending PIN…" : "Send verification PIN"}</button></form>}
    <div className="auth-links"><Link href="/login">Customer sign in</Link><Link href="/">Return to shop</Link></div></section></main>;
}
