import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
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
  useMatch,
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
import {
  api,
  changeSession,
  currentSessionMarker,
  isPrivateQuery,
  sessionChangeKey,
  sessionQueryKey,
  setRequestIdentity,
  SessionContext,
  useAction,
  useData,
  useSession,
} from "./api";
import { Guard, ScrollTop, ErrorBoundary, ErrorBox } from "./ui";
import {
  receiptSuccessPath,
  resetPasswordPath,
  setSensitiveReferrerPolicy,
} from "./receipt-location";
import { Home, Catalog, ProductDetail, Cart, Checkout, Success } from "./store";
import {
  Login,
  Register,
  ForgotPassword,
  GoogleCompletion,
  googleCompletionPath,
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
  const location = useLocation();
  const isReceipt = Boolean(useMatch(receiptSuccessPath));
  const isReset = Boolean(useMatch(resetPasswordPath));
  const isGoogleCompletion = Boolean(useMatch(googleCompletionPath));
  useLayoutEffect(() => {
    setSensitiveReferrerPolicy(isReceipt || isReset || isGoogleCompletion);
  }, [isReceipt, isReset, isGoogleCompletion]);
  const sessionChangePending = useRef(false);
  const [changing, setChanging] = useState(false);
  const [revision, setRevision] = useState(0);
  const session = useData(sessionQueryKey[0], { enabled: !changing });
  const marker = currentSessionMarker();
  const usableSession = !changing && !session.isError && session.data?.marker === marker
    && session.data?.data;
  const user = usableSession?.user;
  const cacheScope = usableSession
    ? `${revision}:${user ? `${user.role}:${user.id}` : "guest"}`
    : null;
  useLayoutEffect(() => {
    setRequestIdentity(usableSession ? user?.id ?? "guest" : undefined, marker);
    client.removeQueries({
      predicate: (query) =>
        isPrivateQuery(query) && query.queryKey[1] !== cacheScope,
    });
  }, [cacheScope, marker, usableSession, user?.id]);
  const reloadIdentity = async (operation) => {
    if (sessionChangePending.current) {
      if (operation) throw new Error("Please wait for the session update to finish.");
      return;
    }
    sessionChangePending.current = true;
    setRequestIdentity(undefined, currentSessionMarker());
    setChanging(true);
    try {
      return await changeSession(client, operation);
    } finally {
      try {
        let requestedMarker;
        do {
          requestedMarker = currentSessionMarker();
          try {
            await client.fetchQuery({
              queryKey: sessionQueryKey,
              queryFn: ({ signal }) => api(sessionQueryKey[0], { signal }),
              staleTime: 0,
              retry: false,
            });
          } catch {
            // A failed session read leaves private queries disabled.
          }
        } while (requestedMarker !== currentSessionMarker());
      } finally {
        sessionChangePending.current = false;
        setRevision((value) => value + 1);
        setChanging(false);
      }
    }
  };
  useLayoutEffect(() => {
    const onStorage = (event) => {
      if (event.key === sessionChangeKey) void reloadIdentity();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return (
    <SessionContext.Provider
      value={{
        user,
        cacheScope,
        isPending: session.isPending || changing ||
          (!session.isError && session.data && session.data.marker !== marker),
        googleEnabled: usableSession?.googleEnabled,
        changeIdentity: reloadIdentity,
      }}
    >
      <LayoutContent
        outletKey={
          isReset || isGoogleCompletion || ["/login", "/register", "/forgot-password"].includes(location.pathname)
            ? undefined
            : (cacheScope ?? "session-loading")
        }
      />
    </SessionContext.Provider>
  );
}
function LayoutContent({ outletKey }) {
  const { user, cacheScope, changeIdentity } = useSession();
  const cart = useData("/cart", {
    enabled: !!cacheScope && (!user || user.role === "CUSTOMER"),
  });
  const logoutAction = useAction();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    const onEscape = (e) => {
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);
  const logout = () =>
    logoutAction.run(
      () =>
        changeIdentity(async () => {
          await api("/auth/logout", {
            method: "POST",
            headers: { "X-Session-Identity": user.id },
          });
          navigate("/", { replace: true });
        }),
      { changesSession: true },
    );
  return (
    <>
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
      <ErrorBox error={logoutAction.error} />
      <Outlet key={outletKey} />
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
    </>
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
              <Route path={receiptSuccessPath} element={<Success />} />
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path={resetPasswordPath} element={<ResetPassword />} />
              <Route path={googleCompletionPath} element={<GoogleCompletion />} />
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
