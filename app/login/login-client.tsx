"use client";

import { useState } from "react";
import BrandLogo from "../components/brand-logo";

type Mode = "signin" | "signup" | "recovery" | "code";

export default function LoginClient({ returnTo, initialMode = "signin" }: { returnTo: string; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const codeMode = mode === "code" || mode === "recovery" || mode === "signup";
  const recovery = mode === "recovery";

  function switchMode(next: Mode) {
    setMode(next); setNotice(""); setIsError(false); setSent(false); setCode("");
  }

  async function read(response: Response) {
    try { return await response.json() as { error?: string }; } catch { return {}; }
  }

  async function sendCode() {
    setBusy(true); setNotice(""); setIsError(false);
    try {
      const response = await fetch("/api/auth/request-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, purpose: recovery ? "recovery" : "sign_in" }) });
      const result = await read(response);
      if (!response.ok) { setNotice(result.error || "We could not send a code"); setIsError(true); }
      else { setSent(true); setNotice(`A 6-digit code was sent to ${email.trim().toLowerCase()}.`); }
    } catch {
      setNotice("We could not send a code. Check your connection and try again."); setIsError(true);
    }
    setBusy(false);
  }

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(""); setIsError(false);
    const endpoint = "/api/auth/password/login";
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await read(response);
      if (!response.ok) { setNotice(result.error || "We could not continue"); setIsError(true); setBusy(false); return; }
      window.location.assign(returnTo);
    } catch {
      setNotice("We could not continue. Please try again."); setIsError(true); setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(""); setIsError(false);
    const endpoint = recovery ? "/api/auth/password/reset" : mode === "signup" ? "/api/auth/password/register" : "/api/auth/verify-code";
    const body = recovery ? { email, code, password } : mode === "signup" ? { name, email, code, password } : { email, code, purpose: "sign_in" };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await read(response);
      if (!response.ok) { setNotice(result.error || "We could not verify that code"); setIsError(true); setBusy(false); return; }
      window.location.assign(returnTo);
    } catch {
      setNotice("We could not continue. Please try again."); setIsError(true); setBusy(false);
    }
  }

  const heading = mode === "signup" ? "Create your account" : recovery ? "Set a new password" : codeMode ? "Sign in with email" : "Welcome back";
  const intro = mode === "signup"
    ? "Save your wishlist, delivery addresses and order history in one place."
    : recovery
      ? "We’ll verify your email with a one-time code, then securely save your new password."
      : codeMode
        ? "A one-time email code is available if you prefer not to use a password."
        : "Sign in to see your favourites, saved addresses and every order in one place.";

  return <main className="auth-page"><BrandLogo variant="stacked" className="auth-brand" priority /><section className="auth-card"><p className="kicker">{mode === "signup" ? "Your Sana account" : recovery ? "Account recovery" : "Your Sana account"}</p><h1>{heading}</h1><p>{intro}</p>{codeMode ? <form onSubmit={verifyCode}>{mode === "signup" && <label><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required disabled={busy} /></label>}<label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={busy} /></label>{sent && <><label><span>6-digit code</span><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" required disabled={busy} /></label>{(recovery || mode === "signup") && <label><span>{recovery ? "New password" : "Create a password"}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={10} required disabled={busy} /><small>At least 10 characters, including a letter and a number.</small></label>}</>}{notice && <p className={`auth-notice ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}>{notice}</p>}{sent ? <button className="button button-dark" disabled={busy}>{busy ? "Verifying…" : recovery ? "Save new password" : mode === "signup" ? "Verify and create account" : "Verify and continue"}</button> : <button type="button" className="button button-dark" onClick={sendCode} disabled={busy || !email || (mode === "signup" && !name)}>{busy ? "Sending…" : mode === "signup" ? "Verify my email" : "Email me a code"}</button>}</form> : <form onSubmit={signInWithPassword}><label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={busy} /></label><label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} /></label>{notice && <p className={`auth-notice ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}>{notice}</p>}<button className="button button-dark" disabled={busy}>{busy ? "Please wait…" : "Sign in"}</button></form>}<div className="auth-links">{sent && <button type="button" onClick={sendCode} disabled={busy}>Send another code</button>}{mode === "signin" && <><button type="button" onClick={() => switchMode("recovery")}>Forgot password?</button><button type="button" onClick={() => switchMode("code")}>Use an email code</button><button type="button" onClick={() => switchMode("signup")}>Create an account</button></>}{mode === "signup" && <button type="button" onClick={() => switchMode("signin")}>Already have an account? Sign in</button>}{mode === "code" && <><button type="button" onClick={() => switchMode("signin")}>Use password instead</button><button type="button" onClick={() => switchMode("signup")}>Create an account</button></>}{recovery && <button type="button" onClick={() => switchMode("signin")}>Back to sign in</button>}</div></section></main>;
}
