import { check } from "./lib.js";
export function quoteTotals({
  subtotalVnd,
  coupon,
  balancePoints = 0,
  pointsToRedeem = 0,
  hasItems = true,
}) {
  const valid = !!coupon && coupon.used_count < coupon.usage_limit;
  const couponDiscountVnd = valid
    ? Math.min(subtotalVnd, coupon.discount_amount_vnd)
    : 0;
  const shippingFeeVnd = hasItems ? 30000 : 0;
  const redeemableBase = subtotalVnd - couponDiscountVnd + shippingFeeVnd;
  const maxRedeemablePoints = Math.min(
    balancePoints,
    Math.floor(redeemableBase / 1000),
  );
  check(
    Number.isInteger(pointsToRedeem) &&
      pointsToRedeem >= 0 &&
      pointsToRedeem <= maxRedeemablePoints,
    422,
    "INVALID_POINTS",
    `You can use up to ${maxRedeemablePoints} points.`,
  );
  const pointsDiscountVnd = pointsToRedeem * 1000;
  const totalPayableVnd = redeemableBase - pointsDiscountVnd;
  return {
    subtotalVnd,
    taxVnd: 0,
    shippingFeeVnd,
    couponDiscountVnd,
    availablePoints: balancePoints,
    maxRedeemablePoints,
    pointsToRedeem,
    pointsDiscountVnd,
    totalPayableVnd,
    estimatedEarnedPoints: Math.floor(totalPayableVnd / 10000),
  };
}
