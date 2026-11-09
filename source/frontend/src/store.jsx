import React, { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  SlidersHorizontal,
  Star,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  ShieldCheck,
  Truck,
  RefreshCw,
  Check,
  Lock,
  Monitor,
  Layers,
  MoveUpRight,
  X,
} from "lucide-react";
import { api, useData, useAction, money, queryString } from "./api";
import {
  Loading,
  ErrorBox,
  Empty,
  PageTitle,
  ProductGrid,
  Pagination,
  Field,
  AddressFields,
  Totals,
  OrderContent,
  Notice,
  useSession,
} from "./ui";
function HomeSection({ section }) {
  const [page, setPage] = useState(1);
  const q = useData(
    `/home/sections/${encodeURIComponent(section.key)}/products?page=${page}&pageSize=8`,
    {
      initialData:
        page === 1 ? { data: section.products, meta: section.meta } : undefined,
    },
  );
  return (
    <section className="collection-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {section.key === "new"
              ? "01 / JUST LANDED"
              : section.key === "best_sellers"
                ? "02 / TRIED. TESTED. LOVED."
                : "THE COLLECTION"}
          </span>
          <h2>{section.title}</h2>
        </div>
        <Link
          className="text-link"
          to={`/products?${section.key.startsWith("category:") ? "category=" + section.key.split(":")[1] : "collection=" + section.key}`}
        >
          View collection <ArrowUpRight size={17} />
        </Link>
      </div>
      <ErrorBox error={q.error} />
      {q.data ? (
        <>
          <ProductGrid products={q.data.data} />
          <Pagination meta={q.data.meta} onChange={setPage} />
        </>
      ) : (
        <Loading />
      )}
    </section>
  );
}
export function Home() {
  const q = useData("/home");
  return (
    <main>
      <div className="container">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-tag">
              <span /> THE NEXT CHAPTER OF YOUR SETUP
            </div>
            <h1>
              Power,
              <br />
              <span>without</span>
              <br />
              the noise.
            </h1>
            <p>
              Extraordinary computers. Essential components.
              <br />
              Everything you need. Nothing you don't.
            </p>
            <Link className="button hero-button" to="/products">
              Explore the collection <ArrowUpRight size={19} />
            </Link>
            <div className="hero-footnote">
              <span>BUILT FOR WHAT'S NEXT</span>
              <span>
                2026 COLLECTION <ArrowRight size={14} />
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <span className="hero-vertical">ENGINEERED FOR POSSIBILITY</span>
            <div className="hero-orbit" />
            <img
              src="/media/catalog/gpu-1.webp"
              alt="Graphics card illustrating the Obsidian component collection"
              fetchPriority="high"
            />
            <div className="hero-caption">
              <div>
                <span className="eyebrow">THE PERFORMANCE COLLECTION</span>
                <strong>Every frame. Every detail.</strong>
              </div>
              <Link
                to="/products?category=gpu"
                aria-label="Explore graphics cards"
              >
                <ArrowUpRight />
              </Link>
            </div>
            <span className="hero-number">01 — 06</span>
          </div>
        </section>
        <div className="benefits">
          <span>
            <Truck />
            Flat-rate delivery <small>Across Vietnam</small>
          </span>
          <span>
            <ShieldCheck />
            Considered configurations{" "}
            <small>Details that make the difference</small>
          </span>
          <span>
            <Layers />
            More from every order <small>Earn 10% back in points</small>
          </span>
        </div>
        <section className="category-strip">
          <div>
            <span className="eyebrow">FIND YOUR FOCUS</span>
            <h2>A place for every possibility.</h2>
          </div>
          <div className="category-links">
            {[
              ["laptop", "Computers"],
              ["monitor", "Displays"],
              ["gpu", "Graphics"],
              ["ram", "Memory"],
              ["ssd", "Storage"],
            ].map(([slug, label]) => (
              <Link key={slug} to={`/products?category=${slug}`}>
                {label}
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        </section>
        <ErrorBox error={q.error} />
        {q.isPending ? (
          <Loading />
        ) : (
          q.data?.data.sections.map((s) => (
            <HomeSection key={s.key} section={s} />
          ))
        )}
        <section className="closing-banner">
          <span className="eyebrow">LESS DISTRACTION. MORE POSSIBILITY.</span>
          <h2>
            Your next great idea
            <br />
            deserves a better setup.
          </h2>
          <Link className="button" to="/products">
            Make it yours <ArrowUpRight size={18} />
          </Link>
        </section>
      </div>
    </main>
  );
}
export function Catalog() {
  const [params, setParams] = useSearchParams(),
    [filtersOpen, setFiltersOpen] = useState(false);
  const q = useData(`/products?${params}`),
    cats = useData("/categories"),
    brands = useData("/brands");
  useEffect(() => {
    const onEscape = (e) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);
  const change = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== "page") p.delete("page");
    setParams(p);
  };
  return (
    <main className="container page">
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <ChevronRight size={13} />
        <span>The collection</span>
      </div>
      <PageTitle
        eyebrow="THOUGHTFULLY SELECTED"
        title="Find your next upgrade."
      >
        Computers and components. Nothing ordinary.
      </PageTitle>
      <div className="catalog-toolbar">
        <div className="catalog-search">
          <input
            aria-label="Search collection"
            placeholder="Search the collection…"
            value={params.get("q") || ""}
            onChange={(e) => change("q", e.target.value)}
          />
        </div>
        <span className="result-count">
          {q.data?.meta.totalItems ?? "…"} products
        </span>
        <button
          className="button secondary filter-toggle"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={16} />
          Filters
        </button>
        <select
          aria-label="Sort products"
          value={params.get("sort") || "newest"}
          onChange={(e) => change("sort", e.target.value)}
        >
          <option value="newest">Newest arrivals</option>
          <option value="best_selling">Best selling</option>
          <option value="name_asc">Name: A–Z</option>
          <option value="name_desc">Name: Z–A</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </div>
      <div className="catalog-layout">
        <aside className={`filters ${filtersOpen ? "filters-open" : ""}`}>
          <div className="section-heading">
            <h3>Refine your selection</h3>
            <button
              className="icon-button mobile-menu"
              aria-label="Close filters"
              onClick={() => setFiltersOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <Field label="Category">
            <select
              value={params.get("category") || ""}
              onChange={(e) => change("category", e.target.value)}
            >
              <option value="">All categories</option>
              {cats.data?.data.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Brand">
            <select
              value={params.get("brand") || ""}
              onChange={(e) => change("brand", e.target.value)}
            >
              <option value="">All brands</option>
              {brands.data?.data.map((b) => (
                <option key={b.name}>{b.name}</option>
              ))}
            </select>
          </Field>
          <div className="filter-group">
            <span>Price range (VND)</span>
            <Field
              label="Minimum"
              type="number"
              min="0"
              value={params.get("minPrice") || ""}
              placeholder="0"
              onChange={(e) => change("minPrice", e.target.value)}
            />
            <Field
              label="Maximum"
              type="number"
              min="0"
              value={params.get("maxPrice") || ""}
              placeholder="No limit"
              onChange={(e) => change("maxPrice", e.target.value)}
            />
          </div>
          <Field label="Customer rating">
            <select
              value={params.get("ratingMin") || ""}
              onChange={(e) => change("ratingMin", e.target.value)}
            >
              <option value="">All ratings</option>
              {[4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} stars & above
                </option>
              ))}
            </select>
          </Field>
          <button className="text-link" onClick={() => setParams({})}>
            Reset filters <RefreshCw size={13} />
          </button>
          <div className="filter-note">
            <Layers size={24} />
            <p>
              Build something
              <br />
              extraordinary.
            </p>
            <small>Find the right pieces for your next chapter.</small>
          </div>
        </aside>
        <section className="catalog-results">
          <ErrorBox error={q.error} />
          {q.isPending ? (
            <Loading />
          ) : q.data?.data.length ? (
            <>
              <ProductGrid products={q.data.data} />
              <Pagination
                meta={q.data.meta}
                onChange={(p) => change("page", String(p))}
              />
            </>
          ) : (
            <>
              <Empty title="No products found">
                Try another search or clear a filter.
              </Empty>
              <Pagination
                meta={q.data?.meta}
                onChange={(p) => change("page", String(p))}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
export function ProductDetail() {
  const { slug } = useParams(),
    q = useData(`/products/${slug}`),
    [selected, setSelected] = useState(null),
    [image, setImage] = useState(0),
    [quantity, setQuantity] = useState(1),
    [commentPage, setCommentPage] = useState(1),
    [added, setAdded] = useState(false),
    [stars, setStars] = useState(0);
  const comments = useData(`/products/${slug}/comments?page=${commentPage}`),
    action = useAction(),
    commentAction = useAction(),
    ratingAction = useAction(),
    client = useQueryClient(),
    { user } = useSession();
  const p = q.data?.data;
  useEffect(() => {
    setSelected(null);
    setImage(0);
    setQuantity(1);
    setAdded(false);
    setCommentPage(1);
  }, [slug]);
  useEffect(() => {
    if (!p?.id) return;
    const socket = io({ transports: ["websocket"] });
    const refresh = () => {
      client.invalidateQueries({ queryKey: [`/products/${slug}`] });
      client.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0]?.startsWith(`/products/${slug}/comments`),
      });
    };
    socket.on("connect", () => {
      socket.emit("product.join", { productId: p.id });
      refresh();
    });
    socket.on("comment.created", refresh);
    socket.on("rating.updated", refresh);
    return () => {
      socket.emit("product.leave", { productId: p.id });
      socket.disconnect();
    };
  }, [p?.id, slug, client]);
  if (q.isPending) return <Loading />;
  if (!p)
    return (
      <main className="container page">
        <ErrorBox error={q.error} />
      </main>
    );
  const v =
    p.variants.find((v) => v.id === selected) ||
    p.variants.find((v) => v.isAvailable) ||
    p.variants[0];
  return (
    <main className="container page">
      <div className="breadcrumb">
        <Link to="/products">Collection</Link>
        <ChevronRight size={13} />
        <Link to={`/products?category=${p.category.slug}`}>
          {p.category.name}
        </Link>
        <ChevronRight size={13} />
        <span>{p.name}</span>
      </div>
      <div className="product-detail">
        <div className="gallery">
          <div className="main-product-image">
            <img
              src={p.images[image]}
              alt={p.imageDetails[image]?.alt || p.name}
            />
            <span className="gallery-index">
              {String(image + 1).padStart(2, "0")} /{" "}
              {String(p.images.length).padStart(2, "0")}
            </span>
          </div>
          <div className="thumbnails">
            {p.images.map((src, n) => (
              <button
                key={src}
                className={n === image ? "active" : ""}
                aria-label={`View product image ${n + 1}`}
                onClick={() => setImage(n)}
              >
                <img
                  src={src}
                  alt={
                    p.imageDetails[n]?.alt || `${p.name} illustration ${n + 1}`
                  }
                />
              </button>
            ))}
          </div>
        </div>
        <div className="product-description">
          <span className="eyebrow">
            {p.brand} / {p.category.name}
          </span>
          <h1>{p.name}</h1>
          <a href="#reviews" className="detail-rating">
            <span className="stars">★★★★★</span> {p.reviewSummary.averageRating}{" "}
            <span>({p.reviewSummary.ratingCount} ratings)</span>
          </a>
          <div className="detail-price">{money(v.priceVnd)}</div>
          <p className="product-intro">{p.shortDescription}</p>
          <div className="variant-picker">
            <span className="field-label">Choose your configuration</span>
            {p.variants.map((item) => (
              <button
                key={item.id}
                className={v.id === item.id ? "active" : ""}
                onClick={() => {
                  setSelected(item.id);
                  setQuantity(1);
                  setAdded(false);
                }}
              >
                <span>
                  {Object.entries(item.attributes)
                    .map(([k, val]) => `${val}`)
                    .join(" / ")}
                </span>
                <small>
                  {money(item.priceVnd)}
                  {!item.isAvailable ? " · Sold out" : ""}
                </small>
                {v.id === item.id && <Check size={16} />}
              </button>
            ))}
          </div>
          <span
            className={`availability ${v.isAvailable ? "" : "unavailable"}`}
          >
            <span />
            {v.isAvailable
              ? `${v.stock} in stock · Ready for your next project`
              : "Currently out of stock"}
          </span>
          <div className="buy-row">
            <div className="quantity">
              <button
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => setQuantity(quantity - 1)}
              >
                <Minus size={15} />
              </button>
              <input
                aria-label="Quantity"
                type="number"
                min="1"
                max={v.stock}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Number(e.target.value)))
                }
              />
              <button
                aria-label="Increase quantity"
                disabled={quantity >= v.stock}
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus size={15} />
              </button>
            </div>
            <button
              className="button"
              disabled={
                !v.isAvailable || action.pending || user?.role === "ADMIN"
              }
              onClick={async () => {
                const r = await action.run(() =>
                  api("/cart/items", {
                    method: "POST",
                    body: { variantId: v.id, quantity },
                  }),
                );
                if (r) setAdded(true);
              }}
            >
              {action.pending
                ? "Adding…"
                : added
                  ? "Added to your bag"
                  : "Add to bag"}
              {added ? <Check size={18} /> : <ShoppingBag size={18} />}
            </button>
          </div>
          <ErrorBox error={action.error} />
          {added && (
            <Link className="text-link" to="/cart">
              View your bag <ArrowRight size={15} />
            </Link>
          )}
          <div className="product-assurances">
            <span>
              <Truck size={17} />
              30,000₫ delivery across Vietnam
            </span>
            <span>
              <Layers size={17} />
              Earn points with every order
            </span>
          </div>
          <div className="specification">
            <h3>The details</h3>
            <ul>
              {p.descriptionLines.map((s, n) => (
                <li key={n}>{s}</li>
              ))}
            </ul>
            <small>SKU: {v.sku}</small>
          </div>
        </div>
      </div>
      <section id="reviews" className="reviews">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FROM THE COMMUNITY</span>
            <h2>Thoughts, shared.</h2>
          </div>
          <span>{p.reviewSummary.commentCount} comments · Live updates</span>
        </div>
        <div className="review-layout">
          <div>
            <ErrorBox error={comments.error} />
            {comments.data?.data.map((c) => (
              <article className="comment" key={c.id}>
                <div className="avatar">{c.authorName[0]?.toUpperCase()}</div>
                <div>
                  <strong>{c.authorName}</strong>
                  <time>
                    {new Date(c.createdAt).toLocaleDateString("en-GB")}
                  </time>
                  <p>{c.body}</p>
                </div>
              </article>
            ))}
            {comments.data?.data.length === 0 && (
              <p className="muted">Be the first to share your thoughts.</p>
            )}
            <Pagination meta={comments.data?.meta} onChange={setCommentPage} />
          </div>
          <div className="panel">
            <h3>Join the conversation</h3>
            <p className="muted">
              Questions, first impressions, or your experience.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  fd = new FormData(form);
                const r = await commentAction.run(() =>
                  api(`/products/${slug}/comments`, {
                    method: "POST",
                    body: {
                      body: fd.get("body"),
                      ...(!user ? { guestName: fd.get("guestName") } : {}),
                    },
                  }),
                );
                if (r) form.reset();
              }}
            >
              {!user && (
                <Field
                  label="Your name"
                  name="guestName"
                  required
                  maxLength="100"
                />
              )}
              <Field label="Your comment">
                <textarea
                  name="body"
                  required
                  minLength="2"
                  maxLength="3000"
                  rows="4"
                />
              </Field>
              <ErrorBox error={commentAction.error} />
              <button
                className="button secondary"
                disabled={commentAction.pending}
              >
                Post comment <ArrowUpRight size={15} />
              </button>
            </form>
            <div className="rate-product">
              <h3>Rate this product</h3>
              {user?.role === "CUSTOMER" ? (
                <>
                  <div className="star-picker">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        aria-label={`Rate ${n} stars`}
                        className={n <= stars ? "chosen" : ""}
                        onClick={async () => {
                          const r = await ratingAction.run(() =>
                            api(`/products/${slug}/rating`, {
                              method: "PUT",
                              body: { stars: n },
                            }),
                          );
                          if (r) setStars(n);
                        }}
                      >
                        <Star size={25} />
                      </button>
                    ))}
                  </div>
                  <ErrorBox error={ratingAction.error} />
                  {stars > 0 && (
                    <small>Your {stars}-star rating is saved.</small>
                  )}
                </>
              ) : (
                <Link className="text-link" to="/login">
                  Sign in to rate <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
export function Cart() {
  const q = useData("/cart"),
    action = useAction();
  const cart = q.data?.data;
  if (q.isPending) return <Loading />;
  return (
    <main className="container page">
      <PageTitle
        eyebrow="GOOD CHOICES START HERE"
        title="Your bag."
        action={
          <Link className="text-link" to="/products">
            Keep exploring <ArrowUpRight size={16} />
          </Link>
        }
      />
      <ErrorBox error={q.error || action.error} />
      {cart?.items.length ? (
        <div className="cart-layout">
          <div>
            {cart.items.map((i) => (
              <div className="cart-item" key={i.id}>
                <Link to={`/products/${i.slug}`}>
                  <img src={i.imageUrl} alt={i.name} />
                </Link>
                <div className="cart-item-info">
                  <Link to={`/products/${i.slug}`}>
                    <h3>{i.name}</h3>
                  </Link>
                  <small>{Object.values(i.attributes).join(" / ")}</small>
                  <span>{money(i.unitPriceVnd)}</span>
                  {i.quantity > i.availableStock && (
                    <small className="danger">
                      Only {i.availableStock} available. Update your quantity.
                    </small>
                  )}
                  <div className="quantity">
                    <button
                      aria-label={`Decrease ${i.name}`}
                      disabled={action.pending || i.quantity <= 1}
                      onClick={() =>
                        action.run(() =>
                          api(`/cart/items/${i.id}`, {
                            method: "PATCH",
                            body: { quantity: i.quantity - 1 },
                          }),
                        )
                      }
                    >
                      <Minus size={14} />
                    </button>
                    <span>{i.quantity}</span>
                    <button
                      aria-label={`Increase ${i.name}`}
                      disabled={
                        action.pending || i.quantity >= i.availableStock
                      }
                      onClick={() =>
                        action.run(() =>
                          api(`/cart/items/${i.id}`, {
                            method: "PATCH",
                            body: { quantity: i.quantity + 1 },
                          }),
                        )
                      }
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="cart-item-total">
                  <strong>{money(i.lineTotalVnd)}</strong>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${i.name}`}
                    disabled={action.pending}
                    onClick={() =>
                      action.run(() =>
                        api(`/cart/items/${i.id}`, { method: "DELETE" }),
                      )
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <aside className="panel cart-summary">
            <h2>A great start.</h2>
            <Totals quote={cart} />
            <p className="fine-print">
              Apply discount codes and points at checkout.
            </p>
            <Link className="button full" to="/checkout">
              Continue to checkout <ArrowRight size={17} />
            </Link>
            <div className="secure-note">
              <Lock size={14} />
              Guest checkout is always welcome.
            </div>
          </aside>
        </div>
      ) : (
        <Empty title="A little room for possibility.">
          Your bag is empty. Find something worth building around.
        </Empty>
      )}
    </main>
  );
}
export function Checkout() {
  const { user } = useSession(),
    cartQ = useData("/cart"),
    addresses = useData("/me/addresses", {
      enabled: user?.role === "CUSTOMER",
    }),
    [step, setStep] = useState(0),
    [buyer, setBuyer] = useState({ fullName: "", email: "" }),
    [address, setAddress] = useState({
      recipientName: "",
      phone: "",
      line1: "",
      ward: "",
      district: "",
      city: "",
      country: "VN",
    }),
    [addressLoaded, setAddressLoaded] = useState(false),
    [coupon, setCoupon] = useState(""),
    [appliedCoupon, setAppliedCoupon] = useState(""),
    [points, setPoints] = useState(0),
    [outcome, setOutcome] = useState("success"),
    [key, setKey] = useState(() => crypto.randomUUID());
  const action = useAction(),
    navigate = useNavigate(),
    cart = cartQ.data?.data;
  useEffect(() => {
    if (user) setBuyer({ fullName: user.fullName, email: user.email });
  }, [user?.id]);
  useEffect(() => {
    const a = addresses.data?.data.find((a) => a.isDefault);
    if (a && !addressLoaded) {
      setAddress(
        ({ recipientName, phone, line1, ward, district, city, country }) => ({
          recipientName: a.recipientName,
          phone: a.phone || "",
          line1: a.line1,
          ward: a.ward,
          district: a.district,
          city: a.city,
          country: a.country,
        }),
      );
      setAddressLoaded(true);
    }
  }, [addresses.data, addressLoaded]);
  const quote = useQuery({
    queryKey: ["quote", appliedCoupon, points, cart?.subtotalVnd],
    queryFn: () =>
      api("/checkout/quote", {
        method: "POST",
        body: {
          couponCode: appliedCoupon || undefined,
          pointsToRedeem: points,
        },
      }),
    enabled: !!cart?.items.length,
    retry: false,
  });
  const submit = async () => {
    const result = await action.run(() =>
      api("/checkout/orders", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: {
          ...(!user ? { buyer } : {}),
          shippingAddress: address,
          couponCode: appliedCoupon || undefined,
          pointsToRedeem: points,
          paymentMethod: "DEMO",
          demoPaymentOutcome: outcome,
        },
      }),
    );
    if (result)
      navigate(`/checkout/success?receipt=${result.data.receiptToken}`, {
        replace: true,
      });
  };
  if (cartQ.isPending) return <Loading />;
  if (!cart?.items.length)
    return (
      <main className="container page">
        <ErrorBox error={cartQ.error} />
        <Empty title="Your bag is empty" />
      </main>
    );
  return (
    <main className="container page checkout-page">
      <PageTitle eyebrow="ONE STEP CLOSER" title="Make it yours." />
      <ol className="checkout-steps">
        {["Your bag", "Delivery", "Payment", "Review"].map((s, n) => (
          <li
            className={step === n ? "active" : step > n ? "done" : ""}
            key={s}
          >
            <span>{step > n ? <Check size={15} /> : n + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="checkout-layout">
        <section className="panel checkout-form">
          <ErrorBox error={action.error} />
          {step === 0 && (
            <>
              <h2>A final look at your bag</h2>
              {cart.items.map((i) => (
                <div className="checkout-item" key={i.id}>
                  <img src={i.imageUrl} alt={i.name} />
                  <div>
                    <strong>{i.name}</strong>
                    <small>
                      {i.sku} · Qty {i.quantity}
                    </small>
                  </div>
                  <span>{money(i.lineTotalVnd)}</span>
                </div>
              ))}
              <Link className="text-link" to="/cart">
                Edit bag
              </Link>
              <button className="button full" onClick={() => setStep(1)}>
                Continue to delivery <ArrowRight size={16} />
              </button>
            </>
          )}
          {step === 1 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setStep(2);
              }}
            >
              <h2>Where should it go?</h2>
              {!user && (
                <>
                  <p className="muted">
                    No account needed. Your order will be saved to your email.
                  </p>
                  <div className="form-grid">
                    <Field
                      label="Full name"
                      required
                      value={buyer.fullName}
                      onChange={(e) =>
                        setBuyer({ ...buyer, fullName: e.target.value })
                      }
                    />
                    <Field
                      label="Email address"
                      type="email"
                      required
                      value={buyer.email}
                      onChange={(e) =>
                        setBuyer({ ...buyer, email: e.target.value })
                      }
                    />
                  </div>
                </>
              )}
              {!!addresses.data?.data.length && (
                <Field label="Saved delivery address">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const a = addresses.data.data.find(
                        (a) => a.id === e.target.value,
                      );
                      if (a)
                        setAddress({
                          recipientName: a.recipientName,
                          phone: a.phone || "",
                          line1: a.line1,
                          ward: a.ward,
                          district: a.district,
                          city: a.city,
                          country: "VN",
                        });
                    }}
                  >
                    <option value="">
                      Choose an address or enter one below
                    </option>
                    {addresses.data.data.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.line1}, {a.city}
                        {a.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <AddressFields value={address} onChange={setAddress} />
              <p className="fine-print">
                Delivery within Vietnam · Flat rate 30,000₫
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setStep(0)}
                >
                  Back
                </button>
                <button className="button">
                  Continue to payment <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
          {step === 2 && (
            <>
              <h2>A few finishing touches.</h2>
              <div className="sandbox-banner">
                <ShieldCheck />
                <div>
                  <strong>Sandbox payment</strong>
                  <p>This is a demonstration. No real money will be charged.</p>
                </div>
              </div>
              <Field label="Payment simulation">
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                >
                  <option value="success">Successful payment</option>
                  <option value="failure">Declined payment (test)</option>
                </select>
              </Field>
              <form
                className="coupon-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  setAppliedCoupon(coupon.toUpperCase());
                }}
              >
                <Field
                  label="Discount code"
                  value={coupon}
                  maxLength="5"
                  placeholder="e.g. HELLO"
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                />
                <button className="button secondary">Apply</button>
              </form>
              {quote.data?.data.coupon && (
                <p
                  className={quote.data.data.coupon.valid ? "saving" : "danger"}
                >
                  {quote.data.data.coupon.message}
                  {quote.data.data.coupon.valid &&
                    ` You save ${money(quote.data.data.coupon.discountVnd)}.`}
                </p>
              )}
              {appliedCoupon && (
                <button
                  className="text-link"
                  onClick={() => {
                    setCoupon("");
                    setAppliedCoupon("");
                  }}
                >
                  Remove code
                </button>
              )}
              {user ? (
                <Field
                  label={`Use your points · ${user.pointsBalance} available`}
                  hint="1 point = 1,000₫. Points earned today are ready for your next order."
                  type="number"
                  min="0"
                  max={user.pointsBalance}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                />
              ) : (
                <p className="fine-print">
                  <Link to="/login?returnTo=/checkout">Sign in</Link> to use
                  points from previous orders.
                </p>
              )}
              <ErrorBox error={quote.error} />
              <div className="form-actions">
                <button className="button secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  className="button"
                  disabled={
                    !quote.data ||
                    quote.isFetching ||
                    !!quote.error ||
                    quote.data?.data.coupon?.valid === false
                  }
                  onClick={() => setStep(3)}
                >
                  Review order <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2>Everything in its place.</h2>
              <div className="review-delivery">
                <h3>Deliver to</h3>
                <strong>{address.recipientName}</strong>
                <p>
                  {address.line1}, {address.ward}, {address.district}
                  <br />
                  {address.city}, Vietnam
                  <br />
                  {address.phone}
                </p>
                <p>{buyer.email}</p>
              </div>
              <p className="muted">
                Payment: Sandbox ·{" "}
                {outcome === "success"
                  ? "Successful payment"
                  : "Declined payment simulation"}
              </p>
              <p className="fine-print">
                The final price and stock are checked when you place your order.
              </p>
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={action.pending}
                  onClick={() => setStep(2)}
                >
                  Back
                </button>
                <button
                  className="button"
                  disabled={action.pending || quote.isFetching || !!quote.error}
                  onClick={submit}
                >
                  {action.pending ? "Placing your order…" : "Place order & pay"}
                  <ArrowUpRight size={17} />
                </button>
              </div>
            </>
          )}
        </section>
        <aside className="panel cart-summary">
          <span className="eyebrow">YOUR NEXT SETUP</span>
          <h2>Order summary</h2>
          <span className="muted">{cart.itemCount} items</span>
          <Totals quote={quote.data?.data || cart} />
          {quote.data && (
            <p className="points-note">
              Earn {quote.data.data.estimatedEarnedPoints} points with this
              order.
            </p>
          )}
          <div className="secure-note">
            <Lock size={14} />
            Calculated securely on our server.
          </div>
        </aside>
      </div>
    </main>
  );
}
export function Success() {
  const [params] = useSearchParams(),
    receipt = params.get("receipt");
  const q = useData(`/checkout/receipts/${receipt}`, { enabled: !!receipt });
  if (q.isPending && receipt) return <Loading />;
  return (
    <main className="container page">
      <div className="success-heading">
        <div className="success-icon">
          <Check size={32} />
        </div>
        <span className="eyebrow">A GREAT CHOICE.</span>
        <h1>It's yours.</h1>
        <p>
          Your order is confirmed. We've queued a confirmation email with all
          the details.
        </p>
        {q.data && <strong>{q.data.data.orderNumber}</strong>}
      </div>
      <ErrorBox error={q.error} />
      {q.data && <OrderContent order={q.data.data} />}
      <div className="center-actions">
        <Link className="button" to="/products">
          Keep exploring <ArrowUpRight size={16} />
        </Link>
        <Link className="button secondary" to="/account/orders">
          View order history
        </Link>
      </div>
    </main>
  );
}
