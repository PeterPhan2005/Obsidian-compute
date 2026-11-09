import React, { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  BarChart3,
  LayoutDashboard,
  Package,
  Users as UsersIcon,
  ShoppingBag,
  Ticket,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Trash2,
  Upload,
  Check,
  Layers,
  TrendingUp,
  Calendar,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { api, useData, useAction, money, date, queryString } from "./api";
import {
  PageTitle,
  Field,
  ErrorBox,
  Notice,
  Loading,
  Pagination,
  Status,
  OrderContent,
  Empty,
} from "./ui";
export function AdminLayout() {
  return (
    <main className="container page admin-page">
      <PageTitle
        eyebrow="OBSIDIAN / STORE MANAGEMENT"
        title="Behind the possibilities."
      />
      <div className="workspace-layout admin-layout">
        <aside className="workspace-nav">
          {[
            ["", "Overview", LayoutDashboard],
            ["analytics", "Advanced analytics", BarChart3],
            ["products", "Products", Package],
            ["categories", "Categories", Layers],
            ["users", "Customers", UsersIcon],
            ["orders", "Orders", ShoppingBag],
            ["coupons", "Discount codes", Ticket],
          ].map(([url, label, Icon]) => (
            <NavLink
              key={url}
              end={url === ""}
              to={`/admin${url ? "/" + url : ""}`}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </aside>
        <div className="workspace-content">
          <Outlet />
        </div>
      </div>
    </main>
  );
}
function Metric({ label, value, detail }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
function Chart({ data, keys, moneyValues = false }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={290}>
        <BarChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#27272a"
            vertical={false}
          />
          <XAxis
            dataKey="bucket"
            stroke="#71717a"
            fontSize={11}
            tickLine={false}
          />
          <YAxis
            stroke="#71717a"
            fontSize={11}
            tickLine={false}
            tickFormatter={(v) =>
              moneyValues
                ? v >= 1000000
                  ? `${(v / 1000000).toFixed(0)}m`
                  : v
                : v
            }
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 8,
            }}
            formatter={(v, n) => [moneyValues ? money(v) : v, n]}
          />
          <Legend />
          {keys.map(([key, label], n) => (
            <Bar
              key={key}
              dataKey={key}
              name={label}
              fill={["#e4e4e7", "#818cf8", "#71717a"][n % 3]}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Dashboard({ advanced = false }) {
  const now = new Date(),
    [filters, setFilters] = useState({
      period: "year",
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      quarter: Math.ceil((now.getMonth() + 1) / 3),
      weekStart: now.toISOString().slice(0, 10),
      from: `${now.getFullYear()}-01-01`,
      to: now.toISOString().slice(0, 10),
      groupBy: "",
    });
  const q = useData(
    advanced
      ? `/admin/dashboard/analytics?${queryString(filters)}`
      : "/admin/dashboard/summary",
  );
  const d = q.data?.data,
    t = d?.totals;
  const update = (key, value) => setFilters({ ...filters, [key]: value });
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>
            {advanced ? "A deeper perspective." : "Your store, at a glance."}
          </h2>
          <p className="muted">
            {advanced
              ? "Compare the moments that move your business."
              : "Real activity. A clear picture."}
          </p>
        </div>
      </div>
      {advanced && (
        <div className="panel analytics-filters">
          <Field label="Period">
            <select
              value={filters.period}
              onChange={(e) => update("period", e.target.value)}
            >
              {["year", "quarter", "month", "week", "custom"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {["year", "quarter", "month"].includes(filters.period) && (
            <Field
              label="Year"
              type="number"
              min="2000"
              max="2100"
              value={filters.year}
              onChange={(e) => update("year", e.target.value)}
            />
          )}
          {filters.period === "quarter" && (
            <Field label="Quarter">
              <select
                value={filters.quarter}
                onChange={(e) => update("quarter", e.target.value)}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    Q{n}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {filters.period === "month" && (
            <Field label="Month">
              <select
                value={filters.month}
                onChange={(e) => update("month", e.target.value)}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {new Date(2026, i).toLocaleString("en", { month: "long" })}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {filters.period === "week" && (
            <Field
              label="Week containing"
              type="date"
              value={filters.weekStart}
              onChange={(e) => update("weekStart", e.target.value)}
            />
          )}
          {filters.period === "custom" && (
            <>
              <Field
                label="From"
                type="date"
                value={filters.from}
                onChange={(e) => update("from", e.target.value)}
              />
              <Field
                label="To"
                type="date"
                value={filters.to}
                onChange={(e) => update("to", e.target.value)}
              />
            </>
          )}
          <Field label="Chart grouping">
            <select
              value={filters.groupBy}
              onChange={(e) => update("groupBy", e.target.value)}
            >
              <option value="">Automatic</option>
              {["year", "quarter", "month", "week", "day"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        d && (
          <>
            <div className="metrics">
              {advanced ? (
                <>
                  <Metric
                    label="Paid orders"
                    value={t.ordersSold}
                    detail={`Previous: ${d.previousTotals.ordersSold}`}
                  />
                  <Metric
                    label="Merchandise revenue"
                    value={money(t.revenueVnd)}
                    detail={`Previous: ${money(d.previousTotals.revenueVnd)}`}
                  />
                  <Metric
                    label="Estimated gross profit"
                    value={money(t.grossProfitVnd)}
                    detail={`Previous: ${money(d.previousTotals.grossProfitVnd)}`}
                  />
                  <Metric
                    label="Units sold"
                    value={t.unitsSold}
                    detail={`${t.distinctProductCount} products · ${t.distinctCategoryCount} categories`}
                  />
                </>
              ) : (
                <>
                  <Metric label="Customers" value={t.totalUsers} />
                  <Metric label="New in 30 days" value={t.newUsers} />
                  <Metric label="Paid orders" value={t.totalOrders} />
                  <Metric
                    label="Merchandise revenue"
                    value={money(t.revenueVnd)}
                  />
                </>
              )}
            </div>
            <div className="panel">
              <div className="section-heading">
                <h3>
                  {advanced
                    ? "Revenue & estimated gross profit"
                    : "Revenue this year"}
                </h3>
                <span className="eyebrow">VND</span>
              </div>
              {advanced && (
                <p className="fine-print">
                  {d.range.from} — {d.range.to} · Compared with{" "}
                  {d.previousRange.from} — {d.previousRange.to}
                </p>
              )}
              <Chart
                data={advanced ? d.series : d.revenueSeries}
                keys={
                  advanced
                    ? [
                        ["revenueVnd", "Revenue"],
                        ["grossProfitVnd", "Gross profit"],
                      ]
                    : [["revenueVnd", "Revenue"]]
                }
                moneyValues
              />
              <p className="fine-print">
                Merchandise revenue excludes shipping and tax, after coupon and
                points discounts. Gross profit subtracts product cost snapshots.
              </p>
            </div>
            {advanced ? (
              <>
                <div className="panel">
                  <h3>Orders, units & product variety</h3>
                  <Chart
                    data={d.series}
                    keys={[
                      ["ordersSold", "Orders"],
                      ["unitsSold", "Units"],
                      ["distinctProductCount", "Distinct products"],
                    ]}
                  />
                </div>
                <div className="panel">
                  <h3>Performance by product type</h3>
                  <Chart
                    data={d.byCategory.map((c) => ({
                      ...c,
                      bucket: c.categoryName,
                    }))}
                    keys={[["unitsSold", "Units sold"]]}
                  />
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Units</th>
                          <th>Revenue</th>
                          <th>Gross profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.byCategory.map((c) => (
                          <tr key={c.categoryName}>
                            <td>{c.categoryName}</td>
                            <td>{c.unitsSold}</td>
                            <td>{money(c.revenueVnd)}</td>
                            <td>{money(c.grossProfitVnd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="dashboard-columns">
                <div className="panel">
                  <h3>Best-selling products</h3>
                  {d.bestSellers.map((p, n) => (
                    <div className="bestseller-row" key={p.productId}>
                      <span>{String(n + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>{p.quantitySold} units sold</small>
                      </div>
                      <b>{money(p.revenueVnd)}</b>
                    </div>
                  ))}
                </div>
                <div className="panel">
                  <h3>Order progress</h3>
                  {d.ordersByStatus.map((s) => (
                    <div className="status-row" key={s.status}>
                      <Status value={s.status} />
                      <strong>{s.count}</strong>
                    </div>
                  ))}
                  <Link className="text-link" to="/admin/orders">
                    Manage orders <ArrowUpRight size={16} />
                  </Link>
                </div>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}
export function AdminProducts() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    q = useData(
      `/admin/products?${queryString({ page, pageSize: 20, q: search })}`,
    ),
    action = useAction();
  return (
    <>
      <div className="section-heading">
        <h2>Products</h2>
        <Link className="button" to="/admin/products/new">
          <Plus size={16} />
          New product
        </Link>
      </div>
      <Field
        label="Search products"
        value={search}
        placeholder="Name, brand or description"
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <ErrorBox error={q.error || action.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price from</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="table-product">
                        <img src={p.thumbnailUrl} alt="" />
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {p.category.name} · {p.variants.length} variants
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{money(p.minPriceVnd)}</td>
                    <td>{p.variants.reduce((s, v) => s + v.stock, 0)}</td>
                    <td>
                      <Status value={p.isActive ? "active" : "archived"} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/admin/products/${p.id}/edit`}>Edit</Link>
                        {p.isActive && (
                          <button
                            className="icon-button"
                            aria-label={`Archive ${p.name}`}
                            onClick={() => {
                              if (
                                confirm(
                                  `Archive ${p.name}? Historical orders will be preserved.`,
                                )
                              )
                                action.run(() =>
                                  api(`/admin/products/${p.id}`, {
                                    method: "DELETE",
                                  }),
                                );
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={q.data?.meta} onChange={setPage} />
        </>
      )}
    </>
  );
}
const newVariant = () => ({
  sku: "",
  attributes: { configuration: "Standard" },
  priceVnd: 1000000,
  costPriceVnd: 700000,
  stock: 10,
  isActive: true,
});
const blankProduct = () => ({
  name: "",
  slug: "",
  brand: "",
  categoryId: "",
  shortDescription: "",
  descriptionLines: ["", "", "", "", ""],
  tags: [],
  images: [],
  variants: [
    newVariant(),
    { ...newVariant(), attributes: { configuration: "Expanded" } },
  ],
  isActive: true,
});
export function ProductForm() {
  const { id } = useParams(),
    q = useData(`/admin/products/${id}`, { enabled: !!id }),
    cats = useData("/categories"),
    [form, setForm] = useState(blankProduct),
    [loaded, setLoaded] = useState(null),
    action = useAction(),
    uploadAction = useAction(),
    navigate = useNavigate();
  useEffect(() => {
    if (q.data && loaded !== id) {
      const p = q.data.data;
      setForm({
        name: p.name,
        slug: p.slug,
        brand: p.brand,
        categoryId: p.category.id,
        shortDescription: p.shortDescription,
        descriptionLines: p.descriptionLines,
        tags: p.tags,
        images: p.imageDetails.map((i) => ({ url: i.url, alt: i.alt })),
        variants: p.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          attributes: v.attributes,
          priceVnd: v.priceVnd,
          costPriceVnd: v.costPriceVnd,
          stock: v.stock,
          isActive: v.isActive,
        })),
        isActive: p.isActive,
      });
      setLoaded(id);
    }
  }, [q.data, id, loaded]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setVariant = (i, key, value) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, n) =>
        n === i ? { ...v, [key]: value } : v,
      ),
    }));
  if (id && q.isPending) return <Loading />;
  return (
    <>
      <div className="section-heading">
        <h2>{id ? "Edit product" : "Create a product"}</h2>
        <Link className="text-link" to="/admin/products">
          All products
        </Link>
      </div>
      <ErrorBox error={q.error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await action.run(() =>
            api(id ? `/admin/products/${id}` : "/admin/products", {
              method: id ? "PATCH" : "POST",
              body: form,
            }),
          );
          if (r) navigate("/admin/products");
        }}
      >
        <div className="panel">
          <h3>The essentials</h3>
          <div className="form-grid">
            <Field
              label="Product name"
              value={form.name}
              required
              onChange={(e) => set("name", e.target.value)}
            />
            <Field
              label="URL slug"
              value={form.slug}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              onChange={(e) => set("slug", e.target.value)}
            />
            <Field
              label="Brand"
              value={form.brand}
              required
              onChange={(e) => set("brand", e.target.value)}
            />
            <Field label="Category">
              <select
                value={form.categoryId}
                required
                onChange={(e) => set("categoryId", e.target.value)}
              >
                <option value="">Choose category</option>
                {cats.data?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Short description">
            <textarea
              value={form.shortDescription}
              required
              minLength="5"
              onChange={(e) => set("shortDescription", e.target.value)}
            />
          </Field>
          <Field label="Description details (at least five lines)">
            <textarea
              rows="7"
              value={form.descriptionLines.join("\n")}
              required
              onChange={(e) =>
                set("descriptionLines", e.target.value.split("\n"))
              }
            />
          </Field>
          <Field
            label="Tags (comma separated)"
            value={form.tags.join(", ")}
            onChange={(e) =>
              set(
                "tags",
                e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              )
            }
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            Visible in the collection
          </label>
        </div>
        <div className="panel">
          <div className="section-heading">
            <h3>Product photography</h3>
            <span className="muted">At least 3 distinct images</span>
          </div>
          <div className="image-editor">
            {form.images.map((image, i) => (
              <div key={`${image.url}-${i}`}>
                <img src={image.url} alt={image.alt || "Product"} />
                <input
                  aria-label={`Image ${i + 1} description`}
                  placeholder="Image description"
                  value={image.alt || ""}
                  onChange={(e) =>
                    set(
                      "images",
                      form.images.map((im, n) =>
                        n === i ? { ...im, alt: e.target.value } : im,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove image ${i + 1}`}
                  onClick={() =>
                    set(
                      "images",
                      form.images.filter((_, n) => n !== i),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <Field
            label={uploadAction.pending ? "Uploading…" : "Upload a photo"}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploadAction.pending}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.set("image", file);
              const r = await uploadAction.run(() =>
                api("/admin/product-images", { method: "POST", body: fd }),
              );
              if (r)
                setForm((f) => ({
                  ...f,
                  images: [...f.images, { url: r.data.url, alt: f.name }],
                }));
              e.target.value = "";
            }}
            hint="JPEG, PNG or WebP. Up to 5 MB each."
          />
          <ErrorBox error={uploadAction.error} />
        </div>
        <div className="panel">
          <div className="section-heading">
            <h3>Configurations & inventory</h3>
            <button
              type="button"
              className="button secondary"
              onClick={() => set("variants", [...form.variants, newVariant()])}
            >
              <Plus size={15} />
              Add variant
            </button>
          </div>
          {form.variants.map((v, i) => (
            <fieldset className="variant-editor" key={v.id || i}>
              <legend>Variant {i + 1}</legend>
              <div className="form-grid">
                <Field
                  label="SKU"
                  value={v.sku}
                  required
                  onChange={(e) => setVariant(i, "sku", e.target.value)}
                />
                {Object.entries(v.attributes).map(([k, val]) => (
                  <Field
                    key={k}
                    label={k}
                    value={val}
                    required
                    onChange={(e) =>
                      setVariant(i, "attributes", {
                        ...v.attributes,
                        [k]: e.target.value,
                      })
                    }
                  />
                ))}
                <Field
                  label="Selling price (VND)"
                  type="number"
                  min="0"
                  max="1000000000"
                  value={v.priceVnd}
                  required
                  onChange={(e) =>
                    setVariant(i, "priceVnd", Number(e.target.value))
                  }
                />
                <Field
                  label="Cost price (VND)"
                  type="number"
                  min="0"
                  max="1000000000"
                  value={v.costPriceVnd}
                  required
                  onChange={(e) =>
                    setVariant(i, "costPriceVnd", Number(e.target.value))
                  }
                />
                <Field
                  label="Stock"
                  type="number"
                  min="0"
                  value={v.stock}
                  required
                  onChange={(e) =>
                    setVariant(i, "stock", Number(e.target.value))
                  }
                />
              </div>
              <button
                type="button"
                className="text-link danger"
                disabled={form.variants.length <= 2}
                onClick={() =>
                  set(
                    "variants",
                    form.variants.filter((_, n) => n !== i),
                  )
                }
              >
                Remove variant
              </button>
            </fieldset>
          ))}
        </div>
        <ErrorBox error={action.error} />
        <div className="form-actions">
          <Link className="button secondary" to="/admin/products">
            Cancel
          </Link>
          <button
            className="button"
            disabled={action.pending || uploadAction.pending}
          >
            {action.pending ? "Saving…" : "Save product"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </>
  );
}
export function Categories() {
  const q = useData("/admin/categories"),
    action = useAction(),
    [editing, setEditing] = useState(null),
    [name, setName] = useState(""),
    [slug, setSlug] = useState("cpu");
  return (
    <>
      <div className="section-heading">
        <h2>Categories</h2>
        <button
          className="button"
          onClick={() => {
            setEditing("new");
            setName("");
            setSlug("cpu");
          }}
        >
          <Plus size={16} />
          New category
        </button>
      </div>
      <ErrorBox error={q.error || action.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.data.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.slug}</td>
                <td>
                  <div className="row-actions">
                    <button
                      onClick={() => {
                        setEditing(c.id);
                        setName(c.name);
                        setSlug(c.slug);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => {
                        if (
                          confirm(
                            `Delete ${c.name}? Categories with active products cannot be removed.`,
                          )
                        )
                          action.run(() =>
                            api(`/admin/categories/${c.id}`, {
                              method: "DELETE",
                            }),
                          );
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await action.run(() =>
              api(
                editing === "new"
                  ? "/admin/categories"
                  : `/admin/categories/${editing}`,
                {
                  method: editing === "new" ? "POST" : "PATCH",
                  body: { name, slug },
                },
              ),
            );
            if (r) setEditing(null);
          }}
        >
          <h3>{editing === "new" ? "Create category" : "Edit category"}</h3>
          <Field
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Field label="Computer category">
            <select value={slug} onChange={(e) => setSlug(e.target.value)}>
              {Object.entries(q.data?.allowedTaxonomy || {}).map(([s, n]) => (
                <option key={s} value={s}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <button className="button" disabled={action.pending}>
              Save category
            </button>
          </div>
        </form>
      )}
    </>
  );
}
export function Users() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [banned, setBanned] = useState(""),
    q = useData(
      `/admin/users?${queryString({ page, q: search, isBanned: banned })}`,
    );
  return (
    <>
      <h2>Customers</h2>
      <div className="form-grid">
        <Field
          label="Search"
          placeholder="Name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Field label="Account status">
          <select
            value={banned}
            onChange={(e) => {
              setBanned(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All customers</option>
            <option value="false">Active</option>
            <option value="true">Suspended</option>
          </select>
        </Field>
      </div>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Orders</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data?.data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.fullName}</strong>
                      <small>{u.email}</small>
                    </td>
                    <td>{u.orderCount}</td>
                    <td>{date(u.createdAt)}</td>
                    <td>
                      <Status value={u.isBanned ? "suspended" : "active"} />
                    </td>
                    <td>
                      <Link to={`/admin/users/${u.id}`}>
                        View <ArrowUpRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={q.data?.meta} onChange={setPage} />
        </>
      )}
    </>
  );
}
export function UserDetail() {
  const { id } = useParams(),
    q = useData(`/admin/users/${id}`),
    action = useAction(),
    [saved, setSaved] = useState(false);
  const u = q.data?.data;
  return (
    <>
      <ErrorBox error={q.error || action.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        u && (
          <>
            <div className="section-heading">
              <h2>{u.fullName}</h2>
              <Status value={u.isBanned ? "suspended" : "active"} />
            </div>
            <div className="metrics">
              <Metric label="Orders" value={u.orderCount} />
              <Metric label="Total paid" value={money(u.totalSpentVnd)} />
            </div>
            <form
              className="panel narrow"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await action.run(() =>
                    api(`/admin/users/${id}`, {
                      method: "PATCH",
                      body: {
                        fullName: new FormData(e.currentTarget).get("fullName"),
                      },
                    }),
                  )
                )
                  setSaved(true);
              }}
            >
              <Field
                label="Full name"
                name="fullName"
                defaultValue={u.fullName}
                required
              />
              <Field label="Email" value={u.email} readOnly />
              {saved && <Notice>Customer updated.</Notice>}
              <div className="form-actions">
                <button className="button" disabled={action.pending}>
                  Save details
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    if (
                      confirm(
                        `${u.isBanned ? "Restore" : "Suspend"} access for this customer?`,
                      )
                    )
                      action.run(() =>
                        api(`/admin/users/${id}`, {
                          method: "PATCH",
                          body: { isBanned: !u.isBanned },
                        }),
                      );
                  }}
                >
                  {u.isBanned ? "Unban customer" : "Ban customer"}
                </button>
              </div>
            </form>
            <div className="panel">
              <h3>Delivery addresses</h3>
              {u.addresses.map((a) => (
                <p key={a.id}>
                  {a.recipientName} · {a.line1}, {a.city} · {a.phone}
                </p>
              ))}
            </div>
          </>
        )
      )}
    </>
  );
}
export function AdminOrders() {
  const [page, setPage] = useState(1),
    [range, setRange] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [status, setStatus] = useState("");
  const q = useData(
    `/admin/orders?${queryString({ page, timeRange: range, from: range === "custom" ? from : undefined, to: range === "custom" ? to : undefined, status })}`,
    { enabled: range !== "custom" || !!(from && to) },
  );
  return (
    <>
      <h2>Orders</h2>
      <div className="analytics-filters">
        <Field label="Time range">
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This week</option>
            <option value="this_month">This month</option>
            <option value="custom">Custom range</option>
          </select>
        </Field>
        {range === "custom" && (
          <>
            <Field
              label="From"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
            <Field
              label="To"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </>
        )}
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {["pending", "confirmed", "shipping", "delivered"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorBox error={q.error} />
      {q.isFetching ? (
        <Loading />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Placed</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data?.data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/admin/orders/${o.id}`}>{o.orderNumber}</Link>
                      <small>
                        {o.items.reduce((s, i) => s + i.quantity, 0)} items
                      </small>
                    </td>
                    <td>
                      {o.buyerName}
                      <small>{o.buyerEmail}</small>
                    </td>
                    <td>{date(o.createdAt)}</td>
                    <td>{money(o.totalPaidVnd)}</td>
                    <td>
                      <Status value={o.status} />
                    </td>
                    <td>
                      <Link
                        aria-label={`View ${o.orderNumber}`}
                        to={`/admin/orders/${o.id}`}
                      >
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={q.data?.meta} onChange={setPage} />
        </>
      )}
    </>
  );
}
export function AdminOrderDetail() {
  const { id } = useParams(),
    q = useData(`/admin/orders/${id}`),
    action = useAction(),
    o = q.data?.data;
  const next =
    o &&
    { pending: "confirmed", confirmed: "shipping", shipping: "delivered" }[
      o.status
    ];
  return (
    <>
      <ErrorBox error={q.error || action.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        o && (
          <>
            <div className="section-heading">
              <div>
                <h2>{o.orderNumber}</h2>
                <p className="muted">
                  {date(o.createdAt)} · {o.buyerName}
                </p>
              </div>
              {next && (
                <button
                  className="button"
                  disabled={action.pending}
                  onClick={() =>
                    action.run(() =>
                      api(`/admin/orders/${id}/status`, {
                        method: "PATCH",
                        body: {
                          expectedCurrentStatus: o.status,
                          newStatus: next,
                        },
                      }),
                    )
                  }
                >
                  Mark {next}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
            <p className="fine-print">
              Discount code: {o.couponCode || "None"} · Payment reference:{" "}
              {o.paymentReference}
            </p>
            <OrderContent order={o} />
          </>
        )
      )}
    </>
  );
}
export function Coupons() {
  const [page, setPage] = useState(1),
    q = useData(`/admin/coupons?page=${page}`);
  return (
    <>
      <div className="section-heading">
        <h2>Discount codes</h2>
        <Link className="button" to="/admin/coupons/new">
          <Plus size={17} />
          Create code
        </Link>
      </div>
      <p className="muted">Five characters. A little more possibility.</p>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Uses</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data?.data.map((c) => (
                  <tr key={c.code}>
                    <td>
                      <Link
                        className="coupon-code"
                        to={`/admin/coupons/${c.code}`}
                      >
                        {c.code}
                      </Link>
                    </td>
                    <td>{money(c.discountAmountVnd)}</td>
                    <td>
                      {c.usedCount} / {c.usageLimit}
                    </td>
                    <td>{date(c.createdAt)}</td>
                    <td>
                      <Link to={`/admin/coupons/${c.code}`}>
                        Details <ArrowUpRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={q.data?.meta} onChange={setPage} />
        </>
      )}
    </>
  );
}
export function CouponForm() {
  const action = useAction(),
    navigate = useNavigate();
  return (
    <form
      className="panel narrow"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const r = await action.run(() =>
          api("/admin/coupons", {
            method: "POST",
            body: {
              code: fd.get("code"),
              discountAmountVnd: Number(fd.get("amount")),
              usageLimit: Number(fd.get("limit")),
            },
          }),
        );
        if (r) navigate(`/admin/coupons/${r.data.code}`);
      }}
    >
      <h2>A new discount code.</h2>
      <Field
        label="Code"
        name="code"
        minLength="5"
        maxLength="5"
        pattern="[A-Za-z0-9]{5}"
        required
        placeholder="HELLO"
        hint="Exactly five letters or numbers."
      />
      <Field
        label="Discount amount (VND)"
        name="amount"
        type="number"
        min="1"
        max="1000000000"
        required
      />
      <Field
        label="Total usage limit"
        name="limit"
        type="number"
        min="1"
        max="10"
        defaultValue="10"
        required
        hint="Up to 10 uses across the whole store. Codes never expire."
      />
      <ErrorBox error={action.error} />
      <div className="form-actions">
        <Link className="button secondary" to="/admin/coupons">
          Cancel
        </Link>
        <button className="button" disabled={action.pending}>
          Create code
        </button>
      </div>
    </form>
  );
}
export function CouponDetail() {
  const { code } = useParams(),
    q = useData(`/admin/coupons/${code}`),
    c = q.data?.data;
  return (
    <>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        c && (
          <>
            <div className="section-heading">
              <h2 className="coupon-code">{c.code}</h2>
              <span className="muted">Created {date(c.createdAt)}</span>
            </div>
            <div className="metrics">
              <Metric
                label="Discount value"
                value={money(c.discountAmountVnd)}
              />
              <Metric
                label="Redemptions"
                value={`${c.usedCount} / ${c.usageLimit}`}
              />
              <Metric label="Remaining uses" value={c.remainingUses} />
            </div>
            <h3>Orders using this code</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Applied discount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {c.orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/admin/orders/${o.id}`}>
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td>{o.buyerEmail}</td>
                      <td>{money(o.discountAppliedVnd)}</td>
                      <td>{date(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!c.orders.length && (
                <p className="muted">This code hasn't been used yet.</p>
              )}
            </div>
          </>
        )
      )}
    </>
  );
}
