import { id } from "./lib.js";

export function bindProductRooms(socket, findActiveProduct) {
  let pending = Promise.resolve();
  function updateRooms(change, message) {
    // Preserve event order across the lookup and adapter operations.
    pending = pending.then(async () => {
      try {
        await change();
      } catch {
        socket.emit("error", { message });
      }
    });
    return pending;
  }

  socket.on("product.join", (message) =>
    updateRooms(async () => {
      const productId = id.safeParse(message?.productId);
      if (!productId.success || !(await findActiveProduct(productId.data))) return;
      for (const room of socket.rooms)
        if (room.startsWith("product:")) await socket.leave(room);
      await socket.join(`product:${productId.data}`);
    }, "Unable to join product updates."),
  );
  socket.on("product.leave", (message) =>
    updateRooms(async () => {
      const productId = id.safeParse(message?.productId);
      if (productId.success) await socket.leave(`product:${productId.data}`);
    }, "Unable to leave product updates."),
  );
}
