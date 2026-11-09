import { z } from "zod";
import {
  createHash,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
export const baseUrl = process.env.APP_BASE_URL || "http://localhost:8080";
export const secret =
  process.env.JWT_SECRET || "obsidian-local-demo-replace-before-public-hosting";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const keyedHash = (value) =>
  createHmac("sha256", secret).update(value).digest("hex");
export function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    a.length === b.length &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export function check(condition, status, code, message) {
  if (!condition) throw new AppError(status, code, message);
}
export const id = z.uuid();
export const text = (min = 1, max = 200) => z.string().trim().min(min).max(max);
export const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export const money = z.number().int().min(0).max(1_000_000_000);
export const addressSchema = z
  .object({
    recipientName: text(1, 120),
    phone: z.string().trim().max(30).optional().nullable(),
    line1: text(1, 250),
    ward: text(1, 100),
    district: text(1, 100),
    city: text(1, 100),
    country: z.literal("VN").default("VN"),
  })
  .strict();
export const addressDb = (a) => ({
  recipient_name: a.recipientName,
  phone: a.phone || null,
  line1: a.line1,
  ward: a.ward,
  district: a.district,
  city: a.city,
  country: "VN",
});
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
export function paging(query, defaultSize = 12) {
  return pageQuery.parse({
    page: query.page,
    pageSize: query.pageSize ?? defaultSize,
  });
}
export const meta = (page, pageSize, totalItems) => ({
  page,
  pageSize,
  totalItems: Number(totalItems),
  totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
});
export const ok = (res, data, status = 200) =>
  res.status(status).json({ data });
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: baseUrl.startsWith("https:"),
  path: "/",
};
export const safeReturn = (value) =>
  typeof value === "string" &&
  /^\/(account|admin|cart|checkout)(\/|\?|$)/.test(value) &&
  !value.includes("\\")
    ? value
    : "/account";
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
