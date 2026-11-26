import http from "node:http";
import Redis from "ioredis";
import { Server } from "socket.io";
import { baseUrl, id } from "./lib.js";
import { bindProductRooms } from "./product-rooms.js";
import { productEventsChannel } from "./product-events.js";

const origin = new URL(baseUrl).origin;
const coreUrl = process.env.CORE_INTERNAL_URL || "http://nginx:8082";
let subscribed = false;
let connectionGeneration = 0;
const server = http.createServer((req, res) => {
  res.writeHead(req.url === "/health" ? (subscribed ? 200 : 503) : 404).end();
});
const io = new Server(server, {
  transports: ["websocket"],
  cors: { origin, credentials: true },
  allowRequest: (req, done) =>
    done(null, !req.headers.origin || req.headers.origin === origin),
});

io.on("connection", (socket) => {
  bindProductRooms(socket, async (productId) => {
    const response = await fetch(`${coreUrl}/internal/realtime/products/${productId}`, {
      signal: AbortSignal.timeout(1500),
      redirect: "error",
    });
    await response.body?.cancel();
    if (response.status === 404) return false;
    if (response.status !== 204) throw new Error("Product lookup failed.");
    return true;
  });
});

const subscriber = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  connectionName: "obsidian-realtime-subscriber",
  autoResubscribe: false,
  autoResendUnfulfilledCommands: false,
  enableOfflineQueue: false,
  commandTimeout: 2000,
});
subscriber.on("close", () => {
  subscribed = false;
  connectionGeneration++;
});
subscriber.on("ready", async () => {
  const generation = connectionGeneration;
  try {
    await subscriber.subscribe(productEventsChannel);
    if (generation !== connectionGeneration) return;
    subscribed = true;
    // Connected browsers may have missed updates while Redis was unavailable.
    io.emit("product.resync");
  } catch {
    if (generation === connectionGeneration) subscriber.disconnect(true);
  }
});
subscriber.on("message", (channel, message) => {
  if (channel !== productEventsChannel) return;
  try {
    const { event, payload } = JSON.parse(message);
    if (["comment.created", "rating.updated"].includes(event) &&
        id.safeParse(payload?.productId).success) {
      io.to(`product:${payload.productId}`).emit(event, payload);
    }
  } catch {
    console.warn("Ignored invalid product update.");
  }
});
subscriber.on("error", () => console.warn("Product subscriber connection error."));

server.listen(3000, "0.0.0.0");
async function shutdown() {
  subscriber.disconnect();
  await io.close();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
