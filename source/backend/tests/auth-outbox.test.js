import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { db, json } from "../src/db.js";
import { Client, shipping } from "./checkout-fixtures.js";
import { isolatedServices } from "./isolated-services.js";

after(() => db.destroy());

async function createQueuedAccount() {
  const client = new Client();
  const email = `auth-worker-${randomUUID()}@example.com`;
  const { line1, ward, district, city, country } = shipping;
  assert.equal((await client.request("/auth/register", "POST", {
    email, fullName: "Auth worker fixture",
    shippingAddress: { line1, ward, district, city, country },
  })).status, 201);
  assert.equal((await client.request("/auth/password/recover/request", "POST", { email })).status, 202);
  const jobs = await db("email_outbox").whereRaw("payload->>'to' = ?", [email]);
  assert.deepEqual(jobs.map(({ type }) => type).sort(), ["OTP", "RESET"]);
  assert.ok(jobs.every(({ payload, status }) => payload.challengeId && status === "pending"));
  return {
    client,
    email,
    otp: jobs.find(({ type }) => type === "OTP"),
    reset: jobs.find(({ type }) => type === "RESET"),
  };
}

test("Worker recovery sends only current OTP and reset challenges, including pending legacy jobs",
  { skip: !process.env.OBSIDIAN_VERIFY_PROJECT }, async () => {
    const { docker, container } = isolatedServices();
    const worker = container("worker");
    const postgres = container("postgres");
    const databaseIdentity = "select current_database() || '|' || system_identifier as identity from pg_control_system()";
    const expectedIdentity = docker("exec", postgres, "psql", "-U", "obsidian",
      "-d", "obsidian_test", "-Atc", databaseIdentity);
    const { rows: [{ identity: actualIdentity }] } = await db.raw(databaseIdentity);
    assert.match(expectedIdentity, /^obsidian_test\|\d+$/);
    assert.equal(actualIdentity, expectedIdentity);
    assert.equal(docker("port", container("mailpit"), "8025"), "127.0.0.1:8026");

    const discarded = [];
    const sent = [];
    docker("stop", worker);
    try {
      const expired = await createQueuedAccount();
      for (const [table, job] of [
        ["login_otps", expired.otp],
        ["password_reset_tokens", expired.reset],
      ]) {
        assert.equal(await db(table).where({ id: job.payload.challengeId })
          .update({ expires_at: new Date(0) }), 1);
        discarded.push(job);
      }

      const consumed = await createQueuedAccount();
      const code = /\b\d{6}\b/.exec(consumed.otp.payload.text)?.[0];
      const token = /#token=([A-Za-z0-9_-]{43})/.exec(consumed.reset.payload.text)?.[1];
      assert.ok(code && token);
      assert.equal((await consumed.client.request("/auth/login/verify-code", "POST", {
        email: consumed.email, code,
      })).status, 200);
      assert.equal((await consumed.client.request("/auth/password/recover/confirm", "POST", {
        token, newPassword: randomUUID(),
      })).status, 204);
      discarded.push(consumed.otp, consumed.reset);

      const superseded = await createQueuedAccount();
      for (const path of ["/auth/login/request-code", "/auth/password/recover/request"]) {
        assert.equal((await superseded.client.request(path, "POST", { email: superseded.email })).status, 202);
      }
      discarded.push(superseded.otp, superseded.reset);
      const replacement = await db("email_outbox").whereRaw("payload->>'to' = ?", [superseded.email])
        .whereNotIn("id", [superseded.otp.id, superseded.reset.id]);
      assert.deepEqual(replacement.map(({ type }) => type).sort(), ["OTP", "RESET"]);
      sent.push(...replacement);

      const legacy = await createQueuedAccount();
      for (const job of [legacy.otp, legacy.reset]) {
        const { to, subject, text } = job.payload;
        assert.equal(await db("email_outbox").where({ id: job.id }).update({
          payload: json({ to, subject, text: text.replace("/reset-password#token=", "/reset-password?token=") }),
        }), 1);
        sent.push(job);
      }
    } finally {
      docker("start", worker);
    }

    const jobs = [...discarded, ...sent];
    let byId;
    for (let attempt = 0; attempt < 40; attempt++) {
      const rows = await db("email_outbox").whereIn("id", jobs.map(({ id }) => id))
        .select("id", "status", "attempts", "last_error", "sent_at");
      byId = new Map(rows.map((row) => [row.id, row]));
      if (byId.size === jobs.length && rows.every(({ status }) => status !== "pending"))
        break;
      await delay(250);
    }
    for (const job of discarded) {
      const record = byId.get(job.id);
      assert.equal(record?.status, "discarded");
      assert.equal(record.attempts, 0);
      assert.equal(record.last_error, "AUTH_CHALLENGE_INVALID");
      assert.equal(record.sent_at, null);
    }
    for (const job of sent) {
      const record = byId.get(job.id);
      assert.equal(record?.status, "sent");
      assert.ok(record.sent_at);
    }

    const inbox = await fetch("http://localhost:8026/api/v1/messages", { signal: AbortSignal.timeout(5000) });
    assert.equal(inbox.status, 200);
    const { messages } = await inbox.json();
    const expectedMessages = sent.map(({ payload }) => `${payload.to}|${payload.subject}`).sort();
    const recipients = new Set(jobs.map(({ payload }) => payload.to));
    const recipientMessages = messages.flatMap(({ To, Subject }) =>
      To.filter(({ Address }) => recipients.has(Address)).map(({ Address }) => `${Address}|${Subject}`),
    );
    assert.deepEqual(recipientMessages.sort(), expectedMessages);
  });
