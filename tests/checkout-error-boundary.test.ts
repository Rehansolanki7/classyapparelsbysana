import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/payments/create-order/route";

test("checkout requires an account before it accepts delivery data", async () => {
  const previous = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    dbHost: process.env.DB_HOST,
  };
  const previousConsoleError = console.error;
  process.env.RAZORPAY_KEY_ID = "rzp_test_regression";
  process.env.RAZORPAY_KEY_SECRET = "test-secret";
  delete process.env.DB_HOST;
  console.error = () => undefined;
  try {
    const response = await POST(new Request("https://classyapparelsbysana.com/api/payments/create-order", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://classyapparelsbysana.com" },
      body: JSON.stringify({
        items: [{ productId: "sea-mist-set", size: "M", quantity: 1 }],
        customer: {
          name: "Checkout Test",
          email: "checkout-test@example.com",
          phone: "9999999999",
          addressLine1: "1 Test Street",
          city: "Mumbai",
          state: "Maharashtra",
          postalCode: "400001",
        },
      }),
    }));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const body = await response.json() as { error?: string };
    assert.match(body.error ?? "", /sign in|create an account/i);
  } finally {
    console.error = previousConsoleError;
    if (previous.keyId === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = previous.keyId;
    if (previous.keySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = previous.keySecret;
    if (previous.dbHost === undefined) delete process.env.DB_HOST; else process.env.DB_HOST = previous.dbHost;
  }
});
