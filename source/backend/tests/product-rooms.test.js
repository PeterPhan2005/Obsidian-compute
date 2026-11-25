import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { bindProductRooms } from "../src/product-rooms.js";

test("Product room handlers validate input and contain lookup and adapter failures", async () => {
  const listeners = new Map();
  const notices = [];
  const rooms = new Set(["connection", `product:${randomUUID()}`]);
  const active = randomUUID();
  let lookups = 0;
  let lookupFailed = true;
  let leaveFailed = false;
  const socket = {
    rooms,
    on: (event, fn) => listeners.set(event, fn),
    emit: (event) => notices.push(event),
    join: async (room) => rooms.add(room),
    leave: async (room) => {
      if (leaveFailed) throw new Error("Fixture adapter unavailable");
      rooms.delete(room);
    },
  };
  bindProductRooms(socket, async (productId) => {
    lookups += 1;
    if (lookupFailed) throw new Error("Fixture lookup unavailable");
    return productId === active;
  });

  for (const input of [undefined, null, {}, { productId: 3 }]) {
    await listeners.get("product.join")(input);
    await listeners.get("product.leave")(input);
  }
  assert.equal(lookups, 0);
  assert.equal(rooms.size, 2);
  await listeners.get("product.join")({ productId: active });
  assert.deepEqual(notices, ["error"]);
  assert.equal(rooms.size, 2);

  lookupFailed = false;
  await listeners.get("product.join")({ productId: active });
  assert.deepEqual([...rooms], ["connection", `product:${active}`]);
  leaveFailed = true;
  await listeners.get("product.leave")({ productId: active });
  assert.deepEqual(notices, ["error", "error"]);
  leaveFailed = false;
  await listeners.get("product.leave")({ productId: active });
  assert.deepEqual([...rooms], ["connection"]);
});

test("Overlapping valid subscriptions leave only the last requested product room", async () => {
  const listeners = new Map();
  const room = (productId) => `product:${productId}`;
  const first = randomUUID();
  const second = randomUUID();
  const rooms = new Set(["connection", room(randomUUID())]);
  const lookup = Promise.withResolvers();
  bindProductRooms(
    {
      rooms,
      on: (event, fn) => listeners.set(event, fn),
      join: async (name) => rooms.add(name),
      leave: async (name) => rooms.delete(name),
    },
    async (productId) => (productId === first ? lookup.promise : true),
  );
  const subscription = listeners.get("product.join");
  const changes = [subscription({ productId: first }), subscription({ productId: second })];
  lookup.resolve(true);
  await Promise.all(changes);
  assert.deepEqual([...rooms], ["connection", room(second)]);
});
