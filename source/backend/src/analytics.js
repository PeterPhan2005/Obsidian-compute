import { DateTime } from "luxon";
import { db } from "./db.js";
import { check } from "./lib.js";
const zone = "Asia/Ho_Chi_Minh";
export function timeRange(q = {}, now = DateTime.now().setZone(zone)) {
  let period = q.period || "year",
    start,
    end,
    previousStart,
    previousEnd;
  const date = (s) => {
    const d = DateTime.fromISO(s || "", { zone });
    check(
      d.isValid && /^\d{4}-\d{2}-\d{2}$/.test(s || ""),
      400,
      "INVALID_DATE",
      "Use a valid YYYY-MM-DD date.",
    );
    return d.startOf("day");
  };
  if (q.timeRange) {
    period = q.timeRange;
  }
  if (period === "custom") {
    start = date(q.from);
    end = date(q.to).plus({ days: 1 });
    check(
      end > start && end.diff(start, "years").years <= 10,
      400,
      "INVALID_RANGE",
      "Choose a valid date range of up to 10 years.",
    );
    previousEnd = start;
    previousStart = start.minus({ days: end.diff(start, "days").days });
  } else if (
    ["today", "yesterday", "this_week", "this_month"].includes(period)
  ) {
    const unit =
      period === "this_week"
        ? "week"
        : period === "this_month"
          ? "month"
          : "day";
    start = now.startOf(unit).minus({ days: period === "yesterday" ? 1 : 0 });
    end = start.plus({ [unit + "s"]: 1 });
    previousEnd = start;
    previousStart = start.minus({ [unit + "s"]: 1 });
  } else if (period === "week") {
    start = q.weekStart
      ? date(q.weekStart).startOf("week")
      : now.startOf("week");
    end = start.plus({ weeks: 1 });
    previousStart = start.minus({ weeks: 1 });
    previousEnd = start;
  } else {
    check(
      ["year", "quarter", "month"].includes(period),
      400,
      "INVALID_PERIOD",
      "Invalid period.",
    );
    const year = Number(q.year || now.year),
      month =
        period === "quarter"
          ? (Number(q.quarter || Math.ceil(now.month / 3)) - 1) * 3 + 1
          : period === "month"
            ? Number(q.month || now.month)
            : 1;
    check(
      Number.isInteger(year) &&
        year >= 2000 &&
        year <= 2100 &&
        Number.isInteger(month) &&
        month >= 1 &&
        month <= 12 &&
        (period !== "quarter" || [1, 4, 7, 10].includes(month)),
      400,
      "INVALID_PERIOD",
      "Invalid calendar period.",
    );
    start = DateTime.fromObject({ year, month, day: 1 }, { zone });
    const duration =
      period === "year"
        ? { years: 1 }
        : period === "quarter"
          ? { months: 3 }
          : { months: 1 };
    end = start.plus(duration);
    previousStart = start.minus(duration);
    previousEnd = start;
  }
  const groupBy =
    q.groupBy ||
    (period === "year" || period === "quarter"
      ? "month"
      : period === "custom"
        ? end.diff(start, "days").days <= 31
          ? "day"
          : end.diff(start, "days").days <= 180
            ? "week"
            : "month"
        : "day");
  check(
    ["year", "quarter", "month", "week", "day"].includes(groupBy),
    400,
    "INVALID_GROUP",
    "Invalid chart grouping.",
  );
  return { period, start, end, previousStart, previousEnd, groupBy };
}
const empty = () => ({
  ordersSold: 0,
  revenueVnd: 0,
  grossProfitVnd: 0,
  unitsSold: 0,
  distinctProductCount: 0,
  distinctCategoryCount: 0,
});
export function allocatedItems(order, items) {
  const net = Math.max(
    0,
    order.subtotal_vnd -
      order.coupon_discount_vnd -
      Math.min(
        order.points_discount_vnd,
        order.subtotal_vnd - order.coupon_discount_vnd,
      ),
  );
  let remaining = net;
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map((i, index) => {
    const revenueVnd =
      index === sorted.length - 1
        ? remaining
        : order.subtotal_vnd
          ? Number(
              (BigInt(net) * BigInt(i.line_total_vnd)) /
                BigInt(order.subtotal_vnd),
            )
          : 0;
    remaining -= revenueVnd;
    return {
      ...i,
      revenueVnd,
      grossProfitVnd: revenueVnd - i.unit_cost_vnd * i.quantity,
    };
  });
}
function metrics(orders, items) {
  const total = empty(),
    products = new Set(),
    cats = new Set();
  for (const o of orders) {
    total.ordersSold++;
    for (const i of allocatedItems(
      o,
      items.filter((i) => i.order_id === o.id),
    )) {
      total.revenueVnd += i.revenueVnd;
      total.grossProfitVnd += i.grossProfitVnd;
      total.unitsSold += i.quantity;
      products.add(i.product_id);
      cats.add(i.category_name_snapshot);
    }
  }
  total.distinctProductCount = products.size;
  total.distinctCategoryCount = cats.size;
  return total;
}
export async function analytics(q) {
  const r = timeRange(q);
  const all = await db("orders")
    .where("created_at", ">=", r.previousStart.toJSDate())
    .where("created_at", "<", r.end.toJSDate());
  const items = all.length
    ? await db("order_items").whereIn(
        "order_id",
        all.map((o) => o.id),
      )
    : [];
  const current = all.filter(
    (o) => new Date(o.created_at) >= r.start.toJSDate(),
  );
  const previous = all.filter(
    (o) => new Date(o.created_at) < r.start.toJSDate(),
  );
  const series = [];
  let cursor = r.start.startOf(r.groupBy);
  while (cursor < r.end) {
    const next = cursor.plus({
      [r.groupBy === "quarter" ? "months" : `${r.groupBy}s`]:
        r.groupBy === "quarter" ? 3 : 1,
    });
    const orders = current.filter(
      (o) =>
        new Date(o.created_at) >= cursor.toJSDate() &&
        new Date(o.created_at) < next.toJSDate(),
    );
    const bucket =
      r.groupBy === "year"
        ? cursor.toFormat("yyyy")
        : r.groupBy === "quarter"
          ? `${cursor.year}-Q${Math.ceil(cursor.month / 3)}`
          : r.groupBy === "month"
            ? cursor.toFormat("yyyy-MM")
            : cursor.toISODate();
    series.push({ bucket, ...metrics(orders, items) });
    cursor = next;
  }
  const byCategory = {};
  for (const o of current)
    for (const i of allocatedItems(
      o,
      items.filter((i) => i.order_id === o.id),
    )) {
      const c = (byCategory[i.category_name_snapshot] ||= {
        categoryName: i.category_name_snapshot,
        unitsSold: 0,
        revenueVnd: 0,
        grossProfitVnd: 0,
      });
      c.unitsSold += i.quantity;
      c.revenueVnd += i.revenueVnd;
      c.grossProfitVnd += i.grossProfitVnd;
    }
  return {
    period: r.period,
    groupBy: r.groupBy,
    range: {
      from: r.start.toISODate(),
      to: r.end.minus({ days: 1 }).toISODate(),
    },
    previousRange: {
      from: r.previousStart.toISODate(),
      to: r.previousEnd.minus({ days: 1 }).toISODate(),
    },
    totals: metrics(current, items),
    previousTotals: metrics(previous, items),
    series,
    byCategory: Object.values(byCategory),
  };
}
export async function summary(days = 30) {
  const orders = await db("orders");
  const items = await db("order_items");
  const totals = metrics(orders, items);
  const [{ count: totalUsers }, { count: newUsers }] = await Promise.all([
    db("users").where({ role: "CUSTOMER" }).count().first(),
    db("users")
      .where({ role: "CUSTOMER" })
      .where("created_at", ">=", new Date(Date.now() - days * 86400000))
      .count()
      .first(),
  ]);
  const products = {};
  for (const o of orders)
    for (const i of allocatedItems(
      o,
      items.filter((i) => i.order_id === o.id),
    )) {
      const p = (products[i.product_id] ||= {
        productId: i.product_id,
        name: i.name_snapshot,
        quantitySold: 0,
        revenueVnd: 0,
      });
      p.quantitySold += i.quantity;
      p.revenueVnd += i.revenueVnd;
    }
  const annual = await analytics({});
  return {
    totals: {
      ...totals,
      totalUsers: Number(totalUsers),
      newUsers: Number(newUsers),
      totalOrders: orders.length,
    },
    bestSellers: Object.values(products)
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 8),
    ordersByStatus: ["pending", "confirmed", "shipping", "delivered"].map(
      (status) => ({
        status,
        count: orders.filter((o) => o.status === status).length,
      }),
    ),
    revenueSeries: annual.series,
  };
}
