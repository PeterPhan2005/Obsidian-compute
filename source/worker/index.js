import nodemailer from "nodemailer";
import { db } from "../backend/src/db.js";
import { escapeHtml, hash, id, keyedHash } from "../backend/src/lib.js";
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

async function isAuthMailCurrent(tx, { type, payload }) {
  const { challengeId, to, text } = payload ?? {};
  if (typeof to !== "string" || typeof text !== "string") return false;

  const isOtp = type === "OTP";
  const challenge = isOtp
    ? tx("login_otps as c")
        .join("users as u", "u.email", "c.email")
        .select("c.consumed_at as invalidated_at", "c.attempts")
    : tx("password_reset_tokens as c")
        .join("users as u", "u.id", "c.user_id")
        .select("c.used_at as invalidated_at");
  challenge.select("c.expires_at").where({ "u.email": to, "u.is_banned": false });
  if (challengeId !== undefined) {
    if (!id.safeParse(challengeId).success) return false;
    challenge.where("c.id", challengeId);
  } else if (isOtp) {
    const code = /^Your sign-in code is (\d{6})\./.exec(text)?.[1];
    if (!code) return false;
    challenge.where("c.code_hash", keyedHash(`${to}:${code}`));
  } else {
    const token = /\/reset-password[?#]token=([A-Za-z0-9_-]{43})(?=\s|$)/.exec(text)?.[1];
    if (!token) return false;
    challenge.where("c.token_hash", hash(token));
  }

  // A legacy OTP reused across two challenges cannot identify one issuance.
  // Read committed state without holding account/challenge locks during SMTP.
  const rows = await challenge.limit(2);
  const [row] = rows;
  return rows.length === 1 && !row.invalidated_at &&
    row.expires_at > new Date() && (!isOtp || row.attempts < 5);
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
      if (["OTP", "RESET"].includes(job.type) && !(await isAuthMailCurrent(tx, job))) {
        await tx("email_outbox").where({ id: job.id }).update({
          status: "discarded",
          last_error: "AUTH_CHALLENGE_INVALID",
        });
        return true;
      }
      try {
        const p = job.payload,
          text = p.order ? orderMail(p.order) : p.text;
        await transporter.sendMail({
          from: mailFrom || "Obsidian Compute <orders@obsidian.local>",
          to: p.to,
          subject: p.order
            ? `Your order ${p.order.orderNumber} has been received`
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
