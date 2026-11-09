import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Search,
  ShoppingBag,
  User,
  Menu,
  X,
  ArrowUpRight,
  ArrowRight,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { api, useData } from "./api";
import { SessionContext, Guard, ScrollTop, ErrorBoundary } from "./ui";
import { Home, Catalog, ProductDetail, Cart, Checkout, Success } from "./store";
import {
  Login,
  Register,
  ForgotPassword,
  ResetPassword,
  AccountLayout,
  Profile,
  Addresses,
  Security,
  OrderHistory,
  OrderDetail,
  Loyalty,
} from "./account";
import {
  AdminLayout,
  Dashboard,
  AdminProducts,
  ProductForm,
  Categories,
  Users,
  UserDetail,
  AdminOrders,
  AdminOrderDetail,
  Coupons,
  CouponForm,
  CouponDetail,
} from "./admin";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: true },
  },
});
function Layout() {
  const session = useData("/auth/session"),
    user = session.data?.data.user;
  const cart = useData("/cart", {
    enabled: !session.isPending && (!user || user.role === "CUSTOMER"),
  });
  const navigate = useNavigate(),
    location = useLocation();
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    const onEscape = (e) => {
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    await client.invalidateQueries();
    navigate("/");
  };
  return (
    <SessionContext.Provider
      value={{
        user,
        isPending: session.isPending,
        googleEnabled: session.data?.data.googleEnabled,
      }}
    >
      <ScrollTop />
      <div className="announcement">
        <span>CONSIDERED HARDWARE. EXTRAORDINARY POSSIBILITIES.</span>
        <span>Vietnam · VND</span>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="Obsidian Compute home">
            <span className="brand-symbol">O</span>
            <span>
              OBSIDIAN<small>COMPUTE</small>
            </span>
          </Link>
          <nav
            className={mobile ? "main-nav open" : "main-nav"}
            aria-label="Main navigation"
          >
            <NavLink to="/products" onClick={() => setMobile(false)}>
              All products
            </NavLink>
            <Link
              to="/products?category=laptop"
              onClick={() => setMobile(false)}
            >
              Computers
            </Link>
            <Link to="/products?category=gpu" onClick={() => setMobile(false)}>
              Components
            </Link>
            <Link
              to="/products?collection=best_sellers"
              onClick={() => setMobile(false)}
            >
              Best sellers
            </Link>
          </nav>
          <div className="header-actions">
            <form
              className="header-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/products?q=${encodeURIComponent(search)}`);
              }}
            >
              <input
                aria-label="Search products"
                placeholder="Find your next upgrade"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button aria-label="Search">
                <Search size={18} />
              </button>
            </form>
            <Link
              className="icon-button"
              aria-label={user ? "Your account" : "Sign in"}
              to={
                user?.role === "ADMIN" ? "/admin" : user ? "/account" : "/login"
              }
            >
              <User size={20} />
            </Link>
            {user?.role !== "ADMIN" && (
              <Link
                className="icon-button bag-link"
                to="/cart"
                aria-label="Shopping bag"
              >
                <ShoppingBag size={20} />
                {!!cart.data?.data.itemCount && (
                  <span>{cart.data.data.itemCount}</span>
                )}
              </Link>
            )}
            {user && (
              <button
                className="icon-button logout"
                aria-label="Sign out"
                onClick={logout}
              >
                <LogOut size={18} />
              </button>
            )}
            <button
              className="icon-button mobile-menu"
              aria-label={mobile ? "Close menu" : "Open menu"}
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <Outlet />
      <footer className="footer">
        <div className="container footer-top">
          <div>
            <Link to="/" className="brand footer-brand">
              OBSIDIAN<small>COMPUTE</small>
            </Link>
            <p>
              For the work you love.
              <br />
              For the worlds you build.
            </p>
          </div>
          <div>
            <span className="eyebrow">THE COLLECTION</span>
            <Link to="/products?category=laptop">Computers</Link>
            <Link to="/products?category=gpu">Components</Link>
            <Link to="/products?category=monitor">Displays</Link>
          </div>
          <div>
            <span className="eyebrow">YOUR OBSIDIAN</span>
            <Link to="/account/orders">Your orders</Link>
            <Link to="/account/loyalty">Rewards</Link>
            <Link to="/account">Your account</Link>
          </div>
          <div className="footer-note">
            <span className="eyebrow">A BETTER KIND OF UPGRADE</span>
            <p>Carefully considered. Effortlessly powerful.</p>
            <Link to="/products">
              Find your next setup <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Obsidian Compute</span>
          <a
            href="/media/catalog/credits.html"
            target="_blank"
            rel="noreferrer"
          >
            Photography credits
          </a>
          <span>Academic demo · Sandbox payments</span>
        </div>
      </footer>
    </SessionContext.Provider>
  );
}
function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="products" element={<Catalog />} />
              <Route path="products/:slug" element={<ProductDetail />} />
              <Route path="cart" element={<Cart />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="checkout/success" element={<Success />} />
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="reset-password" element={<ResetPassword />} />
              <Route element={<Guard />}>
                <Route path="account" element={<AccountLayout />}>
                  <Route index element={<Profile />} />
                  <Route path="addresses" element={<Addresses />} />
                  <Route path="security" element={<Security />} />
                  <Route path="orders" element={<OrderHistory />} />
                  <Route path="orders/:id" element={<OrderDetail />} />
                  <Route path="loyalty" element={<Loyalty />} />
                </Route>
              </Route>
              <Route element={<Guard admin />}>
                <Route path="admin" element={<AdminLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="analytics" element={<Dashboard advanced />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="products/new" element={<ProductForm />} />
                  <Route path="products/:id/edit" element={<ProductForm />} />
                  <Route path="categories" element={<Categories />} />
                  <Route path="users" element={<Users />} />
                  <Route path="users/:id" element={<UserDetail />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="orders/:id" element={<AdminOrderDetail />} />
                  <Route path="coupons" element={<Coupons />} />
                  <Route path="coupons/new" element={<CouponForm />} />
                  <Route path="coupons/:code" element={<CouponDetail />} />
                </Route>
              </Route>
              <Route
                path="*"
                element={
                  <main className="container page">
                    <h1>Page not found</h1>
                    <Link className="button" to="/">
                      Back to home
                    </Link>
                  </main>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
