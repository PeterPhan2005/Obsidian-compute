import React, { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  ArrowRight,
  ArrowUpRight,
  User,
  MapPin,
  Shield,
  Package,
  Gift,
  Plus,
  Trash2,
  Check,
  Mail,
  KeyRound,
} from "lucide-react";
import { api, useData, useAction, money, date } from "./api";
import {
  useSession,
  Field,
  ErrorBox,
  Notice,
  Loading,
  PageTitle,
  AddressFields,
  Empty,
  Pagination,
  OrderContent,
  Status,
} from "./ui";
function AuthLayout({ title, eyebrow, children }) {
  return (
    <main className="auth-layout container">
      <aside className="auth-story">
        <span className="eyebrow">OBSIDIAN / YOUR SPACE</span>
        <h1>
          Good things
          <br />
          start with
          <br />
          <span>you.</span>
        </h1>
        <p>
          Your setup. Your next idea.
          <br />A little more possibility with every visit.
        </p>
        <span className="auth-story-bottom">
          CONSIDERED HARDWARE. PERSONAL POSSIBILITIES.
        </span>
      </aside>
      <section className="auth-panel">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
export function Login() {
  const { googleEnabled, user } = useSession(),
    [params] = useSearchParams(),
    [mode, setMode] = useState(params.has("registered") ? "code" : "password"),
    [sent, setSent] = useState(params.has("registered")),
    navigate = useNavigate(),
    action = useAction();
  const { register, handleSubmit, getValues } = useForm({
    defaultValues: { email: params.get("email") || "" },
  });
  const go = (u) => {
    const next = params.get("returnTo");
    navigate(
      u.role === "ADMIN"
        ? "/admin"
        : next && /^\/(account|cart|checkout)(\/|\?|$)/.test(next)
          ? next
          : "/account",
    );
  };
  const submit = async (b) => {
    if (mode === "code" && !sent) {
      const r = await action.run(() =>
        api("/auth/login/request-code", {
          method: "POST",
          body: { email: b.email },
        }),
      );
      if (r) setSent(true);
      return;
    }
    const r = await action.run(() =>
      api(
        mode === "password"
          ? "/auth/login/password"
          : "/auth/login/verify-code",
        {
          method: "POST",
          body:
            mode === "password"
              ? { email: b.email, password: b.password }
              : { email: b.email, code: b.code },
        },
      ),
    );
    if (r) go(r.data.user);
  };
  return (
    <AuthLayout eyebrow="WELCOME BACK" title="Your next chapter.">
      <p className="muted">Sign in to your Obsidian account.</p>
      <div className="segmented">
        <button
          className={mode === "password" ? "active" : ""}
          onClick={() => {
            setMode("password");
            action.clearError();
          }}
        >
          Password
        </button>
        <button
          className={mode === "code" ? "active" : ""}
          onClick={() => {
            setMode("code");
            action.clearError();
          }}
        >
          Email code
        </button>
      </div>
      <form onSubmit={handleSubmit(submit)}>
        <Field
          label="Email address"
          type="email"
          autoComplete="email"
          required
          {...register("email")}
        />
        {mode === "password" ? (
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            {...register("password")}
          />
        ) : sent ? (
          <>
            <Notice>Check your email for a six-digit code.</Notice>
            <Field
              label="Sign-in code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength="6"
              required
              {...register("code")}
            />
          </>
        ) : (
          <p className="fine-print">
            We'll send a one-time code. No password needed.
          </p>
        )}
        <ErrorBox error={action.error} />
        <button className="button full" disabled={action.pending}>
          {action.pending
            ? "Please wait…"
            : mode === "code" && !sent
              ? "Send sign-in code"
              : "Sign in"}
          <ArrowRight size={17} />
        </button>
      </form>
      {mode === "password" ? (
        <Link className="auth-link" to="/forgot-password">
          Forgot your password?
        </Link>
      ) : (
        sent && (
          <button className="auth-link" onClick={() => setSent(false)}>
            Request another code
          </button>
        )
      )}
      <div className="divider">
        <span>or</span>
      </div>
      {googleEnabled ? (
        <a
          className="button secondary full"
          href={`/api/v1/auth/google/start?returnTo=${encodeURIComponent(params.get("returnTo") || "/account")}`}
        >
          <span className="google-g">G</span>Continue with Google
        </a>
      ) : (
        <p className="fine-print">
          Google sign-in will be available once the store's OAuth credentials
          are configured.
        </p>
      )}
      <p className="auth-switch">
        New to Obsidian?{" "}
        <Link to="/register">
          Create an account <ArrowUpRight size={13} />
        </Link>
      </p>
    </AuthLayout>
  );
}
export function Register() {
  const [address, setAddress] = useState({ country: "VN" }),
    action = useAction(),
    navigate = useNavigate();
  return (
    <AuthLayout eyebrow="MAKE YOURSELF AT HOME" title="A space of your own.">
      <p className="muted">
        Just a few details. We'll email your sign-in code.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const r = await action.run(() =>
            api("/auth/register", {
              method: "POST",
              body: {
                email: fd.get("email"),
                fullName: fd.get("fullName"),
                shippingAddress: address,
              },
            }),
          );
          if (r)
            navigate(
              `/login?registered=1&email=${encodeURIComponent(fd.get("email"))}`,
            );
        }}
      >
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field label="Full name" name="fullName" autoComplete="name" required />
        <fieldset>
          <legend>Shipping address</legend>
          <AddressFields value={address} onChange={setAddress} registration />
        </fieldset>
        <ErrorBox error={action.error} />
        <button className="button full" disabled={action.pending}>
          Create account <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">
        Already here? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
export function ForgotPassword() {
  const action = useAction(),
    [sent, setSent] = useState(false);
  return (
    <AuthLayout eyebrow="LET'S GET YOU BACK IN" title="Forgot your password?">
      <p className="muted">
        Enter your email and we'll send reset instructions.
      </p>
      {sent && (
        <Notice>If the account exists, a reset link is on its way.</Notice>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const email = new FormData(e.currentTarget).get("email");
          if (
            await action.run(() =>
              api("/auth/password/recover/request", {
                method: "POST",
                body: { email },
              }),
            )
          )
            setSent(true);
        }}
      >
        <Field label="Email address" name="email" type="email" required />
        <ErrorBox error={action.error} />
        <button className="button full" disabled={action.pending}>
          Send reset link <Mail size={17} />
        </button>
      </form>
      <Link className="auth-link" to="/login">
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
export function ResetPassword() {
  const [params] = useSearchParams(),
    action = useAction(),
    [done, setDone] = useState(false);
  return (
    <AuthLayout eyebrow="A FRESH START" title="Choose a new password.">
      {done ? (
        <>
          <Notice>Your password is updated.</Notice>
          <Link className="button full" to="/login">
            Sign in
          </Link>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const r = await action.run(async () => {
              await api("/auth/password/recover/confirm", {
                method: "POST",
                body: {
                  token: params.get("token"),
                  newPassword: fd.get("password"),
                },
              });
              return true;
            });
            if (r) setDone(true);
          }}
        >
          <Field
            label="New password"
            name="password"
            type="password"
            minLength="10"
            maxLength="128"
            autoComplete="new-password"
            hint="At least 10 characters."
            required
          />
          <ErrorBox error={action.error} />
          <button className="button full" disabled={action.pending}>
            Reset password <KeyRound size={17} />
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
export function AccountLayout() {
  const { user } = useSession();
  return (
    <main className="container page">
      <PageTitle
        eyebrow="YOUR OBSIDIAN"
        title={`Hello, ${user.fullName.split(" ")[0]}.`}
      >
        A place for your orders, details, and what's next.
      </PageTitle>
      <div className="workspace-layout">
        <aside className="workspace-nav">
          {[
            ["", "Overview", User],
            ["addresses", "Addresses", MapPin],
            ["orders", "Orders", Package],
            ["loyalty", "Rewards", Gift],
            ["security", "Security", Shield],
          ].map(([url, label, Icon]) => (
            <NavLink
              key={url}
              end={url === ""}
              to={`/account${url ? "/" + url : ""}`}
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
export function Profile() {
  const { user } = useSession(),
    action = useAction(),
    [saved, setSaved] = useState(false);
  return (
    <>
      <div className="account-stats">
        <Link className="panel" to="/account/loyalty">
          <Gift size={24} />
          <span className="eyebrow">YOUR REWARDS</span>
          <strong>
            {user.pointsBalance.toLocaleString()} <small>points</small>
          </strong>
          <span>
            {money(user.pointsBalance * 1000)} toward your next order{" "}
            <ArrowUpRight size={15} />
          </span>
        </Link>
        <Link className="panel" to="/account/orders">
          <Package size={24} />
          <span className="eyebrow">YOUR PURCHASES</span>
          <strong>Every great choice.</strong>
          <span>
            Track and revisit your orders <ArrowUpRight size={15} />
          </span>
        </Link>
      </div>
      <div className="panel narrow">
        <h2>Your details</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await action.run(() =>
                api("/me", {
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
            defaultValue={user.fullName}
            required
          />
          <Field
            label="Email address"
            value={user.email}
            readOnly
            hint="Your email is used to keep your orders together."
          />
          <ErrorBox error={action.error} />
          {saved && <Notice>Profile updated.</Notice>}
          <button className="button" disabled={action.pending}>
            Save changes <Check size={16} />
          </button>
        </form>
      </div>
    </>
  );
}
const emptyAddress = {
  recipientName: "",
  phone: "",
  line1: "",
  ward: "",
  district: "",
  city: "",
  country: "VN",
  isDefault: false,
};
export function Addresses() {
  const q = useData("/me/addresses"),
    [editing, setEditing] = useState(null),
    [form, setForm] = useState(emptyAddress),
    action = useAction();
  return (
    <>
      <div className="section-heading">
        <h2>Delivery addresses</h2>
        <button
          className="button secondary"
          onClick={() => {
            setEditing("new");
            setForm({ ...emptyAddress });
          }}
        >
          <Plus size={17} />
          Add address
        </button>
      </div>
      <ErrorBox error={q.error || action.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="address-grid">
          {q.data?.data.map((a) => (
            <div className="panel address-card" key={a.id}>
              {a.isDefault && <span className="status">Default address</span>}
              <h3>{a.recipientName}</h3>
              <p>
                {a.line1}
                <br />
                {a.ward}, {a.district}
                <br />
                {a.city}
              </p>
              <small>{a.phone || "No phone saved"}</small>
              <div className="row-actions">
                <button
                  className="text-link"
                  onClick={() => {
                    setEditing(a.id);
                    setForm({
                      recipientName: a.recipientName,
                      phone: a.phone || "",
                      line1: a.line1,
                      ward: a.ward,
                      district: a.district,
                      city: a.city,
                      country: "VN",
                      isDefault: a.isDefault,
                    });
                  }}
                >
                  Edit
                </button>
                {!a.isDefault && (
                  <button
                    className="text-link"
                    onClick={() =>
                      action.run(() =>
                        api(`/me/addresses/${a.id}`, {
                          method: "PATCH",
                          body: { isDefault: true },
                        }),
                      )
                    }
                  >
                    Make default
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label={`Delete address ${a.line1}`}
                  onClick={() => {
                    if (confirm("Delete this delivery address?"))
                      action.run(() =>
                        api(`/me/addresses/${a.id}`, { method: "DELETE" }),
                      );
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="panel">
          <h2>{editing === "new" ? "A new destination" : "Edit address"}</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await action.run(() =>
                api(
                  editing === "new"
                    ? "/me/addresses"
                    : `/me/addresses/${editing}`,
                  { method: editing === "new" ? "POST" : "PATCH", body: form },
                ),
              );
              if (r) setEditing(null);
            }}
          >
            <AddressFields value={form} onChange={setForm} />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm({ ...form, isDefault: e.target.checked })
                }
              />
              Use as default delivery address
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="button" disabled={action.pending}>
                Save address
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
export function Security() {
  const { user } = useSession(),
    action = useAction(),
    [saved, setSaved] = useState(false);
  return (
    <div className="panel narrow">
      <h2>
        {user.hasPassword ? "Change your password" : "Set your first password"}
      </h2>
      <p className="muted">A little peace of mind for your account.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            fd = new FormData(form);
          const r = await action.run(async () => {
            await api("/auth/password/change", {
              method: "POST",
              body: {
                ...(user.hasPassword
                  ? { currentPassword: fd.get("currentPassword") }
                  : {}),
                newPassword: fd.get("newPassword"),
              },
            });
            return true;
          });
          if (r) {
            setSaved(true);
            form.reset();
          }
        }}
      >
        {user.hasPassword && (
          <Field
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        )}
        <Field
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength="10"
          maxLength="128"
          required
          hint="At least 10 characters."
        />
        <ErrorBox error={action.error} />
        {saved && (
          <Notice>
            Password updated. Other sessions have been signed out.
          </Notice>
        )}
        <button className="button" disabled={action.pending}>
          Save password <Shield size={16} />
        </button>
      </form>
    </div>
  );
}
export function OrderHistory() {
  const [page, setPage] = useState(1),
    q = useData(`/me/orders?page=${page}`);
  return (
    <>
      <h2>Your orders</h2>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : q.data?.data.length ? (
        <>
          <div className="order-cards">
            {q.data.data.map((o) => (
              <Link
                className="panel history-card"
                to={`/account/orders/${o.id}`}
                key={o.id}
              >
                <div>
                  <strong>{o.orderNumber}</strong>
                  <small>{date(o.createdAt)}</small>
                </div>
                <Status value={o.status} />
                <p>
                  {o.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
                </p>
                <strong>{money(o.totalPaidVnd)}</strong>
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
          <Pagination meta={q.data.meta} onChange={setPage} />
        </>
      ) : (
        <Empty title="Your story starts here.">
          Your purchases will appear here, including orders placed as a guest
          with this email.
        </Empty>
      )}
    </>
  );
}
export function OrderDetail() {
  const { id } = useParams(),
    q = useData(`/me/orders/${id}`);
  return (
    <>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        q.data && (
          <>
            <div className="section-heading">
              <div>
                <h2>{q.data.data.orderNumber}</h2>
                <p className="muted">{date(q.data.data.createdAt)}</p>
              </div>
              <Link className="text-link" to="/account/orders">
                All orders
              </Link>
            </div>
            <OrderContent order={q.data.data} />
          </>
        )
      )}
    </>
  );
}
export function Loyalty() {
  const [page, setPage] = useState(1),
    q = useData(`/me/loyalty?page=${page}`);
  return (
    <>
      <div className="rewards-hero">
        <Gift size={30} />
        <span className="eyebrow">EVERY GREAT CHOICE ADDS UP</span>
        <h2>
          {q.data?.data.balancePoints.toLocaleString() || 0}
          <small> points</small>
        </h2>
        <p>
          {money((q.data?.data.balancePoints || 0) * 1000)} toward your next
          setup.
        </p>
        <span>
          1 point = 1,000₫ · Earn points worth 10% of your amount paid, rounded
          down to whole points.
        </span>
      </div>
      <h2>Your rewards history</h2>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Date</th>
                  <th>Points</th>
                  <th>Order</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.type === "EARN"
                        ? "Earned from purchase"
                        : "Redeemed at checkout"}
                    </td>
                    <td>{date(e.createdAt)}</td>
                    <td className={e.pointsDelta >= 0 ? "saving" : ""}>
                      {e.pointsDelta >= 0 ? "+" : ""}
                      {e.pointsDelta}
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        to={`/account/orders/${e.orderId}`}
                      >
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
