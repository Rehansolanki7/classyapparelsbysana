import assert from "node:assert/strict";
import test from "node:test";
import { readJsonResponse } from "../lib/http";

test("JSON responses are parsed safely", async () => {
  const result = await readJsonResponse<{ error?: string }>(new Response('{"error":"Sold out"}', { status: 409 }));
  assert.equal(result.error, "Sold out");
});

test("empty and non-JSON server failures do not throw", async () => {
  assert.deepEqual(await readJsonResponse(new Response("", { status: 500 })), {});
  assert.deepEqual(await readJsonResponse(new Response("<html>Internal Server Error</html>", { status: 500 })), {});
});
