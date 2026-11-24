import nodemailer from "nodemailer";
import { db } from "../backend/src/db.js";
import { escapeHtml } from "../backend/src/lib.js";
const smtpHost = process.env.SMTP_HOST || "localhost";
const smtpSecure = process.env.SMTP_SECURE === "true";
const smtpUser = process.env.SMTP_USER;
const smtpPassword = process.env.SMTP_PASSWORD;
const localSmtp = smtpHost === "mailpit" || smtpHost === "localhost";
const mailFrom = process.env.MAIL_FROM;
if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
  throw new Error("Set both SMTP_USER and SMTP_PASSWORD for SMTP authentication.");
}
if (!localSmtp && !mailFrom) {
  throw new Error("Set MAIL_FROM to an approved sender for external SMTP.");
}
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: Number(process.env.SMTP_PORT || 1025),
  secure: smtpSecure,
  requireTLS: !smtpSecure && (!localSmtp || Boolean(smtpUser)),
  ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPassword } } : {}),
});
const money = (n) => `${Number(n).toLocaleString("en-US")} VND`;
function orderMail(o) {
  const lines = o.items
    .map(
      (i) => `${i.name} · ${i.sku} × ${i.quantity}: ${money(i.lineTotalVnd)}`,
    )
    .join("\n");
  const a = o.shippingAddress;
  return `Thank you for your order, ${o.buyerName}.\n\nOrder ${o.orderNumber}\n${lines}\n\nSubtotal: ${money(o.subtotalVnd)}\nShipping: ${money(o.shippingFeeVnd)}\nTax: ${money(o.taxVnd)}\nCoupon: -${money(o.couponDiscountVnd)}\nPoints: -${money(o.pointsDiscountVnd)}\nTotal paid: ${money(o.totalPaidVnd)}\nPayment: sandbox — no real charge\nStatus: ${o.status}\nPoints earned: ${o.pointsEarned}\n\nDelivery: ${a.recipientName}, ${a.phone}\n${a.line1}, ${a.ward}, ${a.district}, ${a.city}, ${a.country}\n\nSign in with this email to view your purchase history.\nOBSIDIAN COMPUTE`;
}
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
console.log("Obsidian email worker started.");
while (running) {
  try {
    const worked = await db.transaction(async (tx) => {
      const job = await tx("email_outbox")
        .where({ status: "pending" })
        .where("next_attempt_at", "<=", new Date())
        .orderBy("next_attempt_at")
        .forUpdate()
        .skipLocked()
        .first();
      if (!job) return false;
      try {
        const p = job.payload,
          text = p.order ? orderMail(p.order) : p.text;
        await transporter.sendMail({
          from: mailFrom || "Obsidian Compute <orders@obsidian.local>",
          to: p.to,
          subject: p.order
            ? `Your order ${p.order.orderNumber} is confirmed`
            : p.subject,
          text,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px"><h2>OBSIDIAN COMPUTE</h2><pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre></div>`,
          messageId: `<${job.id}@obsidian.local>`,
        });
        await tx("email_outbox")
          .where({ id: job.id })
          .update({
            status: "sent",
            sent_at: new Date(),
            attempts: job.attempts + 1,
            last_error: null,
          });
      } catch (err) {
        await tx("email_outbox")
          .where({ id: job.id })
          .update({
            attempts: job.attempts + 1,
            last_error: String(err.code || "SMTP_ERROR"),
            next_attempt_at: new Date(
              Date.now() +
                Math.min(3600000, 1000 * 2 ** Math.min(job.attempts, 12)),
            ),
          });
      }
      return true;
    });
    if (!worked) await new Promise((r) => setTimeout(r, 1000));
  } catch (err) {
    console.error("Worker database error:", err.code || "UNKNOWN");
    await new Promise((r) => setTimeout(r, 3000));
  }
}
await db.destroy();
