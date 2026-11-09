import test from "node:test";
import assert from "node:assert/strict";
import { quoteTotals } from "../src/pricing.js";
import { allocatedItems, timeRange } from "../src/analytics.js";
import { DateTime } from "luxon";
test("PDF loyalty example: 1,000,000 paid earns 100 points", () => {
  const q = quoteTotals({ subtotalVnd: 970000 });
  assert.equal(q.totalPayableVnd, 1000000);
  assert.equal(q.estimatedEarnedPoints, 100);
});
test("Redemption never consumes a fraction of a point", () => {
  const q = quoteTotals({
    subtotalVnd: 500,
    balancePoints: 100,
    pointsToRedeem: 30,
  });
  assert.equal(q.totalPayableVnd, 500);
  assert.equal(q.pointsDiscountVnd, 30000);
  assert.throws(() =>
    quoteTotals({ subtotalVnd: 500, balancePoints: 100, pointsToRedeem: 31 }),
  );
});
test("Coupon is capped at merchandise and points can cover shipping", () => {
  const q = quoteTotals({
    subtotalVnd: 100000,
    coupon: { discount_amount_vnd: 500000, used_count: 0, usage_limit: 1 },
    balancePoints: 30,
    pointsToRedeem: 30,
  });
  assert.equal(q.couponDiscountVnd, 100000);
  assert.equal(q.totalPayableVnd, 0);
  assert.equal(q.estimatedEarnedPoints, 0);
});
test("Points and exhausted coupons cannot create a negative total", () => {
  assert.throws(() =>
    quoteTotals({ subtotalVnd: 100000, balancePoints: 0, pointsToRedeem: 1 }),
  );
  const q = quoteTotals({
    subtotalVnd: 100000,
    coupon: { discount_amount_vnd: 50000, used_count: 1, usage_limit: 1 },
  });
  assert.equal(q.couponDiscountVnd, 0);
  assert.equal(q.totalPayableVnd, 130000);
});
test("Integer revenue allocation reconciles across items", () => {
  const order = {
    subtotal_vnd: 1001,
    coupon_discount_vnd: 7,
    points_discount_vnd: 0,
  };
  const items = [
    { id: "a", line_total_vnd: 500, unit_cost_vnd: 300, quantity: 1 },
    { id: "b", line_total_vnd: 501, unit_cost_vnd: 301, quantity: 1 },
  ];
  const rows = allocatedItems(order, items);
  assert.equal(
    rows.reduce((s, i) => s + i.revenueVnd, 0),
    994,
  );
  assert.equal(
    rows.reduce((s, i) => s + i.grossProfitVnd, 0),
    393,
  );
});
test("Calendar analytics ranges respect Vietnam timezone and leap years", () => {
  const r = timeRange(
    { period: "month", year: 2024, month: 3 },
    DateTime.fromISO("2024-03-10", { zone: "Asia/Ho_Chi_Minh" }),
  );
  assert.equal(r.previousStart.toISODate(), "2024-02-01");
  assert.equal(r.previousEnd.diff(r.previousStart, "days").days, 29);
  assert.equal(r.start.toUTC().toISO(), "2024-02-29T17:00:00.000Z");
  assert.throws(() =>
    timeRange({ period: "custom", from: "2026-02-30", to: "2026-03-02" }),
  );
});
