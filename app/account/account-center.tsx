"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES, INDIA_STATES, countryName } from "../../lib/locations";

export type SavedAddress = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  countryCode: string;
  postalCode: string;
  isDefault: boolean;
};

type AddressDraft = Omit<SavedAddress, "id">;

const blankAddress = (): AddressDraft => ({ label: "Home", recipientName: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "Maharashtra", countryCode: "IN", postalCode: "", isDefault: false });

async function responseJson(response: Response) {
  try { return await response.json() as { error?: string; address?: SavedAddress; name?: string; message?: string }; } catch { return {}; }
}

export default function AccountCenter({ user, initialAddresses, hasPassword }: { user: { name: string; email: string }; initialAddresses: SavedAddress[]; hasPassword: boolean }) {
  const router = useRouter();
  const [addresses, setAddresses] = useState(initialAddresses);
  const [profileName, setProfileName] = useState(user.name);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(blankAddress());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletionCodeSent, setDeletionCodeSent] = useState(false);
  const [deletionCode, setDeletionCode] = useState("");
  const domestic = addressDraft.countryCode === "IN";

  function message(next: string, failed = false) { setError(failed ? next : ""); setNotice(failed ? "" : next); }
  function updateAddress<K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) { setAddressDraft((current) => ({ ...current, [key]: value })); }
  function beginNew() { setEditingId(null); setAddressDraft({ ...blankAddress(), isDefault: !addresses.length }); setShowAddressForm(true); message(""); }
  function beginEdit(address: SavedAddress) { const { id, ...draft } = address; setEditingId(id); setAddressDraft(draft); setShowAddressForm(true); message(""); }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); message("");
    const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: profileName }) });
    const result = await responseJson(response);
    if (!response.ok) message(result.error || "We could not update your profile.", true);
    else message("Your profile has been updated.");
    setBusy(false);
  }

  async function saveAddress(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); message("");
    const response = await fetch("/api/account/addresses", { method: editingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editingId ? { id: editingId, address: addressDraft } : { address: addressDraft }) });
    const result = await responseJson(response);
    if (!response.ok || !result.address) { message(result.error || "We could not save that address.", true); setBusy(false); return; }
    setAddresses((current) => {
      const next = editingId ? current.map((item) => item.id === editingId ? result.address! : item) : [result.address!, ...current];
      return next.sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
    });
    setShowAddressForm(false); setEditingId(null); message("Your delivery address has been saved."); setBusy(false);
  }

  async function removeAddress(id: string) {
    if (!window.confirm("Remove this saved address?")) return;
    setBusy(true); message("");
    const response = await fetch(`/api/account/addresses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = await responseJson(response);
    if (!response.ok) message(result.error || "We could not remove that address.", true);
    else { setAddresses((current) => current.filter((item) => item.id !== id)); message("Address removed."); }
    setBusy(false);
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { message("The new passwords do not match.", true); return; }
    setBusy(true); message("");
    const response = await fetch("/api/account/password", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, password: newPassword }) });
    const result = await responseJson(response);
    if (!response.ok) message(result.error || "We could not update your password.", true);
    else { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); message("Your password has been updated securely."); }
    setBusy(false);
  }

  async function exportData() {
    setBusy(true); message("");
    try {
      const response = await fetch("/api/account/privacy", { cache: "no-store" });
      if (!response.ok) { const result = await responseJson(response); throw new Error(result.error || "We could not create your export."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "classy-apparels-account-data.json"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      message("Your account-data export has been downloaded.");
    } catch (caught) { message(caught instanceof Error ? caught.message : "We could not create your export.", true); }
    setBusy(false);
  }

  async function sendDeletionCode() {
    if (!window.confirm("We will remove your profile, addresses, wishlist and restock requests. Paid-order records must remain for legal and accounting obligations. Continue?")) return;
    setBusy(true); message("");
    const response = await fetch("/api/account/privacy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send_deletion_code" }) });
    const result = await responseJson(response);
    if (!response.ok) message(result.error || "We could not send a verification code.", true);
    else { setDeletionCodeSent(true); message("A 6-digit verification code has been sent to your email."); }
    setBusy(false);
  }

  async function completeDeletion(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); message("");
    const response = await fetch("/api/account/privacy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request_deletion", code: deletionCode }) });
    const result = await responseJson(response);
    if (!response.ok) { message(result.error || "We could not complete the deletion request.", true); setBusy(false); return; }
    router.replace("/?account_deleted=1");
  }

  return <section className="account-center"><div className="account-center-heading"><div><p className="kicker">Account details</p><h2>Everything you need, in one place.</h2></div><p>Keep checkout quick with your saved profile and delivery addresses.</p></div>{(notice || error) && <p className={`account-center-notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error || notice}</p>}<div className="account-settings-grid"><article className="account-setting-card"><div className="account-setting-heading"><div><p className="kicker">Profile</p><h3>Your details</h3></div><span>Secure</span></div><form onSubmit={saveProfile} className="account-form"><label><span>Name</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} autoComplete="name" required disabled={busy} /></label><label><span>Email address</span><input value={user.email} type="email" autoComplete="email" disabled aria-describedby="email-help" /><small id="email-help">Your email is used for sign-in and order history.</small></label><button className="button button-outline" disabled={busy}>Save profile</button></form></article><article className="account-setting-card"><div className="account-setting-heading"><div><p className="kicker">Sign-in & security</p><h3>{hasPassword ? "Change password" : "Add a password"}</h3></div><span>Encrypted</span></div><p className="account-card-copy">{hasPassword ? "Use a new, unique password. We never store the password itself." : "You signed in with email. Add a password if you would also like password sign-in."}</p><form onSubmit={savePassword} className="account-form">{hasPassword && <label><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required disabled={busy} /></label>}<label><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={10} required disabled={busy} /><small>At least 10 characters, including a letter and a number.</small></label><label><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={10} required disabled={busy} /></label><button className="button button-outline" disabled={busy}>{hasPassword ? "Update password" : "Add password"}</button></form></article></div><div className="address-book"><div className="address-book-heading"><div><p className="kicker">Delivery addresses</p><h2>Address book</h2><p>Choose a saved address at checkout, or add another one for family and gifts.</p></div><button type="button" className="button button-dark" onClick={beginNew} disabled={busy}>Add address</button></div>{showAddressForm && <form className="address-form" onSubmit={saveAddress}><div className="address-form-heading"><h3>{editingId ? "Edit address" : "New delivery address"}</h3><button type="button" onClick={() => { setShowAddressForm(false); setEditingId(null); }} disabled={busy}>Close</button></div><div className="address-form-grid"><label><span>Label</span><input value={addressDraft.label} onChange={(event) => updateAddress("label", event.target.value)} placeholder="Home, Work…" maxLength={40} required /></label><label><span>Recipient name</span><input value={addressDraft.recipientName} onChange={(event) => updateAddress("recipientName", event.target.value)} autoComplete="name" required /></label><label><span>Phone</span><input value={addressDraft.phone} onChange={(event) => updateAddress("phone", event.target.value)} autoComplete="tel" inputMode="tel" required /></label><label className="wide"><span>Flat, floor, building and street</span><input value={addressDraft.addressLine1} onChange={(event) => updateAddress("addressLine1", event.target.value)} autoComplete="address-line1" required /></label><label className="wide"><span>Area / landmark <small>optional</small></span><input value={addressDraft.addressLine2} onChange={(event) => updateAddress("addressLine2", event.target.value)} autoComplete="address-line2" /></label><label className="wide"><span>Country</span><select value={addressDraft.countryCode} onChange={(event) => setAddressDraft((current) => ({ ...current, countryCode: event.target.value, state: event.target.value === "IN" ? "Maharashtra" : "", postalCode: "" }))} autoComplete="country">{COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label><label><span>City</span><input value={addressDraft.city} onChange={(event) => updateAddress("city", event.target.value)} autoComplete="address-level2" required /></label><label><span>{domestic ? "State / union territory" : "State / province / region"}</span>{domestic ? <select value={addressDraft.state} onChange={(event) => updateAddress("state", event.target.value)} autoComplete="address-level1">{INDIA_STATES.map((state) => <option key={state}>{state}</option>)}</select> : <input value={addressDraft.state} onChange={(event) => updateAddress("state", event.target.value)} autoComplete="address-level1" required />}</label><label><span>{domestic ? "PIN code" : "Postal / ZIP code"}</span><input value={addressDraft.postalCode} onChange={(event) => updateAddress("postalCode", domestic ? event.target.value.replace(/\D/g, "") : event.target.value.toUpperCase())} inputMode={domestic ? "numeric" : "text"} maxLength={domestic ? 6 : 20} autoComplete="postal-code" required /></label><label className="address-default"><input type="checkbox" checked={addressDraft.isDefault} onChange={(event) => updateAddress("isDefault", event.target.checked)} /><span>Make this my default address</span></label></div><button className="button button-dark" disabled={busy}>{busy ? "Saving…" : "Save address"}</button></form>}<div className="address-list">{addresses.length ? addresses.map((address) => <article className="address-card" key={address.id}><div><div className="address-card-top"><strong>{address.label}</strong>{address.isDefault && <span>Default</span>}</div><p><b>{address.recipientName}</b><br />{address.addressLine1}{address.addressLine2 && <><br />{address.addressLine2}</>}<br />{address.city}, {address.state} {address.postalCode}<br />{countryName(address.countryCode)} · {address.phone}</p></div><div><button type="button" onClick={() => beginEdit(address)} disabled={busy}>Edit</button><button type="button" onClick={() => removeAddress(address.id)} disabled={busy}>Remove</button></div></article>) : <div className="address-empty"><strong>No saved addresses yet.</strong><p>Save your first delivery address to make future checkout faster.</p></div>}</div></div><section className="privacy-centre"><div><p className="kicker">Privacy centre</p><h2>Your data, your choices.</h2><p>Download a copy of the data linked to this account, correct it above, or request deletion. Paid-order and delivery records are retained for seven financial years when accounting or law requires it.</p></div><div className="privacy-actions"><button type="button" className="button button-outline" onClick={exportData} disabled={busy}>Download my data</button>{!deletionCodeSent ? <button type="button" className="button button-outline privacy-delete" onClick={sendDeletionCode} disabled={busy}>Request account deletion</button> : <form onSubmit={completeDeletion}><label><span>6-digit email code</span><input value={deletionCode} onChange={(event) => setDeletionCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required /></label><button className="button privacy-delete" disabled={busy}>Confirm deletion</button></form>}</div></section></section>;
}
