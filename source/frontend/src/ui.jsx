import React, { createContext, useContext, useEffect, useState } from "react";
import { Link, useLocation, Navigate, Outlet } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  TriangleAlert,
  ShoppingBag,
  Package,
  Star,
  X,
} from "lucide-react";
import { useData, money, date } from "./api";
export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" />
      <span>Loading your next setup…</span>
    </div>
  );
}
export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="error-box" role="alert">
      <TriangleAlert size={18} />
      <div>
        {error.message}
        {error.details?.map((d, i) => (
          <small key={i}>
            {d.field}: {d.reason}
          </small>
        ))}
      </div>
    </div>
  );
}
export function Notice({ children }) {
  return (
    <div className="notice">
      <Check size={17} />
      {children}
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  children,
  link = "/products",
  label = "Explore products",
}) {
  return (
    <div className="empty">
      <Package size={36} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      <Link className="button" to={link}>
        {label}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
export function PageTitle({ eyebrow, title, children, action }) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Pagination({ meta, onChange }) {
  if (!meta) return null;
  const pages = [
    ...new Set([
      1,
      ...Array.from({ length: 5 }, (_, i) => meta.page - 2 + i).filter(
        (n) => n >= 1 && n <= meta.totalPages,
      ),
      meta.totalPages,
    ]),
  ].sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        aria-label="Previous page"
        disabled={meta.page <= 1}
        onClick={() => onChange(meta.page - 1)}
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((n, i) => (
        <React.Fragment key={n}>
          {i > 0 && n - pages[i - 1] > 1 && <span>…</span>}
          <button
            aria-label={`Page ${n}`}
            aria-current={meta.page === n ? "page" : undefined}
            className={meta.page === n ? "selected" : ""}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        </React.Fragment>
      ))}
      <button
        aria-label="Next page"
        disabled={meta.page >= meta.totalPages}
        onClick={() => onChange(meta.page + 1)}
      >
        <ChevronRight size={16} />
      </button>
      <span className="page-count">{meta.totalItems} results</span>
    </nav>
  );
}
export function ProductCard({ product: p }) {
  return (
    <Link className="product-card" to={`/products/${p.slug}`}>
      <div className="product-image">
        <img
          src={p.thumbnailUrl}
          alt={p.imageDetails?.[0]?.alt || p.name}
          loading="lazy"
        />
        <span className="product-arrow">
          <ArrowUpRight size={19} />
        </span>
        {!p.variants.some((v) => v.isAvailable) && (
          <span className="stock-label">Sold out</span>
        )}
      </div>
      <div className="product-info">
        <div className="product-meta">
          <span>{p.category.name}</span>
          <span className="rating">
            <Star size={12} />
            {p.reviewSummary.averageRating.toFixed(1)}
          </span>
        </div>
        <h3>{p.name}</h3>
        <p>{p.shortDescription}</p>
        <div className="product-price">
          <span>
            <small>From </small>
            {money(p.minPriceVnd)}
          </span>
          <span className="variant-count">{p.variants.length} options</span>
        </div>
      </div>
    </Link>
  );
}
export function ProductGrid({ products }) {
  return (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
export function Status({ value }) {
  return (
    <span className={`status status-${value}`}>
      {value?.replaceAll("_", " ")}
    </span>
  );
}
export function Field({ label, children, hint, ...props }) {
  const fieldId = React.useId(),
    labelId = `${fieldId}-label`,
    hintId = `${fieldId}-hint`;
  const attrs = {
    id: fieldId,
    "aria-labelledby": labelId,
    "aria-describedby": hint ? hintId : undefined,
  };
  return (
    <label className="field" htmlFor={fieldId}>
      <span id={labelId}>{label}</span>
      {children ? (
        React.cloneElement(children, attrs)
      ) : (
        <input {...attrs} {...props} />
      )}
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  );
}
export function AddressFields({ value, onChange, registration = false }) {
  const fields = registration
    ? [
        ["line1", "Street address"],
        ["ward", "Ward"],
        ["district", "District"],
        ["city", "City"],
      ]
    : [
        ["recipientName", "Recipient name"],
        ["phone", "Phone number"],
        ["line1", "Street address"],
        ["ward", "Ward"],
        ["district", "District"],
        ["city", "City"],
      ];
  return (
    <div className="form-grid">
      {fields.map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={value[key] || ""}
          required
          onChange={(e) =>
            onChange({ ...value, [key]: e.target.value, country: "VN" })
          }
          autoComplete={
            key === "phone"
              ? "tel"
              : key === "line1"
                ? "address-line1"
                : undefined
          }
        />
      ))}
    </div>
  );
}
export function Totals({ quote: q }) {
  if (!q) return null;
  return (
    <dl className="totals">
      <div>
        <dt>Subtotal</dt>
        <dd>{money(q.subtotalVnd)}</dd>
      </div>
      <div>
        <dt>Shipping</dt>
        <dd>{money(q.shippingFeeVnd ?? 30000)}</dd>
      </div>
      <div>
        <dt>Tax</dt>
        <dd>{money(q.taxVnd)}</dd>
      </div>
      {!!q.couponDiscountVnd && (
        <div className="saving">
          <dt>Discount code</dt>
          <dd>−{money(q.couponDiscountVnd)}</dd>
        </div>
      )}
      {!!q.pointsDiscountVnd && (
        <div className="saving">
          <dt>Points redeemed</dt>
          <dd>−{money(q.pointsDiscountVnd)}</dd>
        </div>
      )}
      <div className="total">
        <dt>Total</dt>
        <dd>
          {money(q.totalPayableVnd ?? q.totalPaidVnd ?? q.subtotalVnd + 30000)}
        </dd>
      </div>
    </dl>
  );
}
export function OrderContent({ order: o }) {
  return (
    <div className="order-layout">
      <div>
        <div className="panel">
          <div className="section-heading">
            <h2>Order items</h2>
            <Status value={o.status} />
          </div>
          {o.items.map((i) => (
            <div className="order-item" key={i.id || i.sku}>
              <img src={i.imageUrl || i.thumbnailUrl} alt={i.name} />
              <div>
                <strong>{i.name}</strong>
                <small>
                  {i.sku} · Quantity {i.quantity}
                </small>
                <small>{money(i.unitPriceVnd)} each</small>
              </div>
              <strong>{money(i.lineTotalVnd)}</strong>
            </div>
          ))}
        </div>
        <div className="panel">
          <h2>Order timeline</h2>
          <ol className="timeline">
            {o.statusHistory.map((s) => (
              <li key={s.id || s.status}>
                <span className="timeline-dot" />
                <strong>{s.status}</strong>
                <time>{date(s.changedAt)}</time>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <aside>
        <div className="panel">
          <h2>Payment summary</h2>
          <Totals quote={o} />
          <p className="fine-print">Sandbox payment · No real charge</p>
          <span className="points-note">
            +{o.pointsEarned} points earned for your next order
          </span>
        </div>
        <div className="panel">
          <h2>Delivery details</h2>
          <strong>{o.shippingAddress.recipientName}</strong>
          <p>
            {o.shippingAddress.line1}
            <br />
            {o.shippingAddress.ward}, {o.shippingAddress.district}
            <br />
            {o.shippingAddress.city}, Vietnam
          </p>
          <p>
            {o.shippingAddress.phone}
            <br />
            {o.buyerEmail}
          </p>
        </div>
      </aside>
    </div>
  );
}
export function Guard({ admin = false }) {
  const s = useSession(),
    loc = useLocation();
  if (s.isPending) return <Loading />;
  if (!s.user)
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(loc.pathname)}`}
        replace
      />
    );
  if (s.user.role !== (admin ? "ADMIN" : "CUSTOMER"))
    return (
      <Empty
        title="This page is for a different account"
        link={s.user.role === "ADMIN" ? "/admin" : "/account"}
        label="Go to your account"
      />
    );
  return <Outlet />;
}
export function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
export class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main className="container">
        <Empty
          title="Something interrupted this page"
          link="/"
          label="Back to home"
        >
          Please refresh the page to try again.
        </Empty>
      </main>
    ) : (
      this.props.children
    );
  }
}
