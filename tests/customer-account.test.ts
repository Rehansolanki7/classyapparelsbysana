import assert from "node:assert/strict";
import test from "node:test";
import { validateAddress } from "../lib/customer";
import { hashPassword, passwordProblem, verifyPassword } from "../lib/passwords";

test("passwords are validated and can only be checked through their salted hash", async () => {
  assert.equal(passwordProblem("short1"), "Use at least 10 characters for your password.");
  assert.equal(passwordProblem("longpassword"), "Include at least one letter and one number.");
  const hash = await hashPassword("A-strong-password-2026");
  assert.equal(hash.includes("A-strong-password-2026"), false);
  assert.equal(await verifyPassword("A-strong-password-2026", hash), true);
  assert.equal(await verifyPassword("another-password-2026", hash), false);
});

test("saved delivery addresses keep the same server-side validation as checkout", () => {
  const valid = validateAddress({ recipientName: "Sana Khan", phone: "+919999999999", addressLine1: "4B, Linking Road", city: "Mumbai", state: "Maharashtra", countryCode: "IN", postalCode: "400050" });
  assert.equal("address" in valid, true);
  const invalid = validateAddress({ recipientName: "Sana", phone: "123", addressLine1: "Road", city: "Mumbai", state: "Maharashtra", countryCode: "IN", postalCode: "000000" });
  assert.equal("error" in invalid, true);
});
