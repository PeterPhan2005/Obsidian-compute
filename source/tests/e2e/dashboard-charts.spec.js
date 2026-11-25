import { test, expect } from "@playwright/test";

async function loginAsAdmin(page) {
  await page.goto("/login");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("admin@obsidian.local");
  await page.getByLabel("Password", { exact: true }).fill("ObsidianAdmin!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function expectNoOverflow(page) {
  // ResponsiveContainer measures the new width with ResizeObserver.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width + 1);
}

test("Best Sellers visualizes the existing ranking and quantities at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await loginAsAdmin(page);
  const endpoint = "/api/v1/admin/dashboard/summary";
  const response = await page.request.get(endpoint);
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  expect(data.bestSellers.length).toBeGreaterThan(0);

  const chart = page.getByRole("list", { name: "Units sold by product" });
  const rows = chart.getByRole("listitem");
  await expect(rows).toHaveCount(data.bestSellers.length);
  for (const [i, product] of data.bestSellers.entries()) {
    const row = rows.nth(i);
    await expect(row.getByText(product.name, { exact: true })).toBeVisible();
    await expect(
      row.getByText(`${product.quantitySold} units sold`, { exact: true }),
    ).toBeVisible();
    const track = row.locator(".bestseller-track");
    const bar = track.locator("div");
    await expect(bar).toHaveCSS("background-color", "rgb(129, 140, 248)");
    const trackBox = await track.boundingBox();
    const barBox = await bar.boundingBox();
    expect(barBox.width / trackBox.width).toBeCloseTo(
      product.quantitySold / data.bestSellers[0].quantitySold,
      2,
    );
  }
  await expectNoOverflow(page);

  await page.route(`**${endpoint}`, (route) =>
    route.fulfill({ json: { data: { ...data, bestSellers: [] } } }),
  );
  await page.reload();
  await expect(page.getByText("No products sold yet.")).toBeVisible();
  await expect(chart).toHaveCount(0);
});

test("Hidden revenue tooltip does not overflow after resizing the dashboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route("**/api/v1/admin/dashboard/summary", (route) =>
    route.fulfill({
      json: {
        data: {
          totals: {
            totalUsers: 1,
            newUsers: 1,
            totalOrders: 3,
            revenueVnd: 6000000,
          },
          revenueSeries: [1, 2, 3].map((month) => ({
            bucket: `2026-0${month}`,
            revenueVnd: month * 1000000,
          })),
          bestSellers: [],
          ordersByStatus: [],
        },
      },
    }),
  );
  await loginAsAdmin(page);
  const panel = page.locator(".panel").filter({
    has: page.getByRole("heading", { name: "Revenue this year" }),
  });
  const chart = panel.getByRole("application");
  const bars = panel.locator(".recharts-bar-rectangle path");
  const tooltip = panel.locator(".recharts-tooltip-wrapper");
  await expect(bars).toHaveCount(3);
  await bars.last().hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("2026-03");
  await expect(tooltip).toContainText("3,000,000₫");
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();

  await page.setViewportSize({ width: 375, height: 900 });
  await expect
    .poll(async () => (await chart.boundingBox())?.width)
    .toBeLessThanOrEqual(375);
  await expectNoOverflow(page);
  await expect(tooltip).toBeHidden();
  await expect
    .poll(() =>
      bars.evaluateAll(
        (elements) =>
          elements.filter((bar) => {
            const { width, height } = bar.getBoundingClientRect();
            return width > 0 && height > 0;
          }).length,
      ),
    )
    .toBe(3);

  await chart.focus();
  await chart.press("ArrowRight");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("2026-02");
  await expect(tooltip).toContainText("2,000,000₫");
  await expectNoOverflow(page);
  await chart.press("Escape");
  await expect(tooltip).toBeHidden();
  await expectNoOverflow(page);
  await chart.press("ArrowRight");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("3,000,000₫");
});

test("Advanced Dashboard displays category counts and named sales across calendar periods", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const endpoint = "/api/v1/admin/dashboard/analytics";
  const analyticsResponse = (filters) =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === endpoint &&
        Object.entries(filters).every(
          ([key, value]) => url.searchParams.get(key) === value,
        )
      );
    });
  const typeChart = page.getByRole("region", {
    name: "Product types sold over time",
  });
  const annualResponse = analyticsResponse({ period: "year" });
  await page.getByRole("link", { name: "Advanced analytics" }).click();
  const { data: annual } = await (await annualResponse).json();
  expect(annual.groupBy).toBe("month");
  expect(annual.series).toHaveLength(12);
  await expect(
    page.getByText("Distinct categories", { exact: true }),
  ).toBeVisible();
  await expect(typeChart.locator(".recharts-bar").first()).toBeVisible();
  for (const { categoryName } of annual.byCategory) {
    await expect(
      typeChart.getByText(categoryName, { exact: true }),
    ).toBeVisible();
  }
  const firstSaleIndex = annual.series.findIndex((bucket) => bucket.unitsSold);
  expect(firstSaleIndex).toBeGreaterThanOrEqual(0);
  const firstSale = annual.series[firstSaleIndex];
  const chartSvg = typeChart.getByRole("application");
  await chartSvg.focus();
  for (let i = 0; i < firstSaleIndex; i++) {
    await chartSvg.press("ArrowRight");
  }
  const tooltip = typeChart.getByRole("status");
  await expect(tooltip.locator(".recharts-tooltip-label")).toHaveText(
    firstSale.bucket,
  );
  for (const { categoryName, unitsSold } of firstSale.categoryUnits) {
    const item = tooltip.locator(".recharts-tooltip-item").filter({
      has: page.getByText(categoryName, { exact: true }),
    });
    await expect(item.locator(".recharts-tooltip-item-value")).toHaveText(
      String(unitsSold),
    );
  }

  const period = page.getByLabel("Period", { exact: true });
  const grouping = page.getByLabel("Chart grouping");
  for (const mode of ["quarter", "month", "week"]) {
    const next = analyticsResponse({ period: mode });
    await period.selectOption(mode);
    expect((await next).ok()).toBe(true);
    await expect(typeChart.locator(".recharts-bar").first()).toBeVisible();
  }
  for (const by of ["year", "quarter", "month", "week", "day"]) {
    const next = analyticsResponse({ period: "week", groupBy: by });
    await grouping.selectOption(by);
    const { data } = await (await next).json();
    expect(data.groupBy).toBe(by);
    await expect(typeChart.locator(".recharts-bar").first()).toBeVisible();
  }
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoOverflow(page);
  }

  const custom = analyticsResponse({ period: "custom" });
  await period.selectOption("custom");
  expect((await custom).ok()).toBe(true);
  const from = page.getByLabel("From", { exact: true });
  const to = page.getByLabel("To", { exact: true });
  await to.fill("2099-04-01");
  const empty = analyticsResponse({ period: "custom", from: "2099-04-01" });
  await from.fill("2099-04-01");
  const { data: emptyData } = await (await empty).json();
  expect(emptyData.series).toHaveLength(1);
  expect(emptyData.series[0].categoryUnits).toEqual([]);
  await expect(
    typeChart.getByText("No product types sold in this period."),
  ).toBeVisible();

  const invalid = analyticsResponse({ period: "custom", to: "2099-03-31" });
  await to.fill("2099-03-31");
  expect((await invalid).status()).toBe(400);
  await expect(page.getByRole("alert")).toContainText(
    "Choose a valid date range",
  );
});

test("Long category legends leave room for positive bars on mobile and desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await loginAsAdmin(page);
  const names = Array.from({ length: 4 }, (_, i) =>
    `Category ${i + 1} `.padEnd(80, "W"),
  );
  const totals = {
    ordersSold: 12,
    revenueVnd: 2400,
    grossProfitVnd: 1440,
    unitsSold: 24,
    distinctProductCount: 4,
    distinctCategoryCount: 4,
  };
  const series = [1, 2, 3].map((month) => ({
    ...totals,
    ordersSold: 4,
    revenueVnd: 400 * month,
    grossProfitVnd: 240 * month,
    unitsSold: 4 * month,
    bucket: `2026-0${month}`,
    categoryUnits: names.map((categoryName) => ({
      categoryName,
      unitsSold: month,
    })),
  }));
  await page.route("**/api/v1/admin/dashboard/analytics?*", (route) =>
    route.fulfill({
      json: {
        data: {
          range: { from: "2026-01-01", to: "2026-12-31" },
          previousRange: { from: "2025-01-01", to: "2025-12-31" },
          totals,
          previousTotals: totals,
          series,
          byCategory: names.map((categoryName) => ({
            categoryName,
            unitsSold: 6,
            revenueVnd: 600,
            grossProfitVnd: 360,
          })),
        },
      },
    }),
  );
  await page.getByRole("link", { name: "Advanced analytics" }).click();
  const typeChart = page.getByRole("region", {
    name: "Product types sold over time",
  });
  await expect(typeChart.getByText(names[0], { exact: true })).toBeVisible();
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        typeChart.evaluate(async (region) => {
          // Read the plot after resize and legend measurements have settled.
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          const bars = region.querySelectorAll(".recharts-bar-rectangle path");
          return Array.from(bars).filter((bar) => {
            const { width, height } = bar.getBoundingClientRect();
            return (
              width > 0 &&
              height > 0 &&
              getComputedStyle(bar).visibility === "visible"
            );
          }).length;
        }),
      )
      .toBe(12);
    await expectNoOverflow(page);
  }
  const legend = typeChart.getByRole("list", { name: "Product type legend" });
  await expect(legend.getByRole("listitem")).toHaveText(names);
  await page.setViewportSize({ width: 375, height: 900 });
  const chartSvg = typeChart.getByRole("application");
  await chartSvg.focus();
  await chartSvg.press("ArrowRight");
  const tooltip = typeChart.getByRole("status");
  await expect(tooltip.locator(".recharts-tooltip-label")).toHaveText(
    "2026-02",
  );
  for (const name of names) {
    const item = tooltip
      .locator(".recharts-tooltip-item")
      .filter({ hasText: name });
    await expect(item.locator(".recharts-tooltip-item-value")).toHaveText("2");
  }
  await expectNoOverflow(page);
});

test("Category chart preserves distinct IDs, renamed series and legacy labels", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const current = "11111111-ffff-4fff-8fff-111111111111";
  const distinct = "22222222-ffff-4fff-8fff-222222222222";
  const category = (categoryId, categoryName, unitsSold) => ({
    categoryId,
    categoryKey: categoryId ?? `legacy:${categoryName}`,
    categoryName,
    unitsSold,
    revenueVnd: unitsSold * 100,
    grossProfitVnd: unitsSold * 40,
  });
  const byCategory = [
    category(current, "Hardware", 4),
    category(distinct, "Hardware", 2),
    category(null, "Hardware", 1),
  ];
  const totals = {
    ordersSold: 4,
    revenueVnd: 700,
    grossProfitVnd: 280,
    unitsSold: 7,
    distinctProductCount: 3,
    distinctCategoryCount: 3,
    legacyCategoryNameCount: 1,
  };
  await page.route("**/api/v1/admin/dashboard/analytics?*", (route) =>
    route.fulfill({
      json: {
        data: {
          range: { from: "2026-01-01", to: "2026-12-31" },
          previousRange: { from: "2025-01-01", to: "2025-12-31" },
          totals,
          previousTotals: totals,
          byCategory,
          series: [
            {
              ...totals,
              bucket: "2026-01",
              categoryUnits: [category(current, "Old hardware name", 1)],
            },
            {
              ...totals,
              bucket: "2026-02",
              categoryUnits: [
                category(current, "Hardware", 3),
                ...byCategory.slice(1),
              ],
            },
          ],
        },
      },
    }),
  );
  await page.getByRole("link", { name: "Advanced analytics" }).click();
  const chart = page.getByRole("region", {
    name: "Product types sold over time",
  });
  const legend = chart.getByRole("list", { name: "Product type legend" });
  await expect(legend.getByRole("listitem")).toHaveText([
    "Hardware (11111111)",
    "Hardware (22222222)",
    "Hardware (legacy)",
  ]);
  await expect
    .poll(() =>
      chart.locator(".recharts-bar-rectangle path").evaluateAll(
        (bars) =>
          bars.filter((bar) => {
            const { width, height } = bar.getBoundingClientRect();
            return (
              width > 0 &&
              height > 0 &&
              getComputedStyle(bar).visibility === "visible"
            );
          }).length,
      ),
    )
    .toBe(4);
  await expect(
    page.getByText("Historical category identities are unknown", {
      exact: false,
    }),
  ).toBeVisible();
});
