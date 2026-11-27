import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";
import { db } from "../src/db.js";
import { BASE, Client, ORIGIN } from "./checkout-fixtures.js";
import { isolatedServices } from "./isolated-services.js";

test("Public guest and Customer comments use one DTO across HTTP and realtime", async () => {
  const { docker, container } = isolatedServices();
  const identitySql = "SELECT current_database(), system_identifier::text FROM pg_control_system()";
  const expectedIdentity = docker(
    "exec", container("postgres"), "psql", "-U", "obsidian",
    "-d", "obsidian_test", "-Atc", identitySql,
  );
  const comments = [];
  const socket = io(BASE, {
    transports: ["websocket"],
    extraHeaders: { Origin: ORIGIN },
    reconnection: false,
    timeout: 3000,
    autoConnect: false,
  });
  try {
    const { rows: [identity] } = await db.raw(identitySql);
    assert.equal(`${identity.current_database}|${identity.system_identifier}`, expectedIdentity);
    const guest = new Client();
    const customer = new Client();
    const { body: session } = await customer.login("alex@example.com", "ObsidianCustomer!2026");
    const { body: catalog } = await guest.request("/products?pageSize=1");
    const [product] = catalog.data;
    const path = `/products/${product.slug}/comments`;
    socket.connect();
    assert.equal(await socket.timeout(5000).emitWithAck("product.join", { productId: product.id }), true);

    const publicKeys = ["authorName", "body", "createdAt", "id", "productId"];
    for (const [client, authorName] of [
      [guest, "Guest reviewer"],
      [customer, session.data.user.fullName],
    ]) {
      const content = `Review fixture ${randomUUID()}`;
      const event = Promise.withResolvers();
      const onComment = (message) => event.resolve(message);
      socket.once("comment.created", onComment);
      try {
        const response = await client.request(path, "POST", {
          body: content,
          ...(client === guest ? { guestName: authorName } : {}),
        });
        assert.equal(response.status, 201);
        const comment = response.body.data;
        comments.push(comment);
        assert.deepEqual(Object.keys(comment).sort(), publicKeys);
        assert.equal(comment.authorName, authorName);
        assert.equal(comment.body, content);
        assert.equal(comment.productId, product.id);
        assert.ok(Number.isFinite(Date.parse(comment.createdAt)));
        const update = await Promise.race([event.promise, delay(5000, null, { ref: false })]);
        assert.equal(update?.productId, product.id);
        assert.deepEqual(update.comment, comment);
        assert.ok(update.commentCount > 0);
        const record = await db("comments").where({ id: comment.id }).first();
        assert.equal(record.user_id, client === guest ? null : session.data.user.id);
        assert.equal(record.guest_name, client === guest ? authorName : null);
      } finally {
        socket.off("comment.created", onComment);
      }
    }

    const firstPage = await guest.request(path + "?page=1&pageSize=1");
    const secondPage = await guest.request(path + "?page=2&pageSize=1");
    assert.equal(firstPage.status, 200);
    assert.equal(secondPage.status, 200);
    assert.equal(firstPage.body.meta.page, 1);
    assert.equal(secondPage.body.meta.page, 2);
    assert.deepEqual([...firstPage.body.data, ...secondPage.body.data], [...comments].reverse());
  } finally {
    socket.close();
    try {
      if (comments.length) await db("comments").whereIn("id", comments.map(({ id }) => id)).delete();
    } finally {
      await db.destroy();
    }
  }
});
