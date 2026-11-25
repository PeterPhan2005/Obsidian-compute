import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";

export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);
export const sessionQueryKey = ["/auth/session"];
export const sessionChangeKey = "obsidian-session-changed";

const privatePath = /^\/(?:me|admin|cart|checkout)(?:[/?]|$)/;
const cartDependentPath = /^\/(?:cart\/items(?:\/|$)|checkout\/quote$)/;
export const isPrivateQuery = (query) => query.queryKey[0] === "private";
export const isAuthorizationError = (error) =>
  error?.status === 401 || error?.status === 403 || error?.code === "SESSION_CHANGED";

let csrfToken, csrfPromise, refreshPromise, cartPromise;
let cartReady = false;
let sessionRevision = 0;
let changingSession = false;
let requestIdentity;
let sessionMarker;

export function currentSessionMarker() {
  try {
    return localStorage.getItem(sessionChangeKey);
  } catch {
    return null;
  }
}

export function setRequestIdentity(identity, marker) {
  if (requestIdentity !== identity || sessionMarker !== marker) {
    sessionRevision += 1;
    cartReady = false;
  }
  requestIdentity = identity;
  sessionMarker = marker;
}

export function notifySessionChange() {
  try {
    localStorage.setItem(sessionChangeKey, `${Date.now()}-${Math.random()}`);
  } catch {
    // The API identity check still fences stale requests.
  }
}

function indexedCartLock(work) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("obsidian-cart", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("lock");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("lock", "readwrite");
      const store = tx.objectStore("lock");
      let operation, finished = false;
      // Overlapping read/write transactions on this store are exclusive across
      // tabs. Keep the transaction alive until the response applies its cookie.
      function step() {
        store.get(0).onsuccess = () => {
          if (!operation) {
            operation = Promise.resolve().then(work);
            const finish = () => { finished = true; };
            operation.then(finish, finish);
          }
          if (!finished) step();
        };
      }
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("Unable to coordinate your cart."));
      };
      tx.oncomplete = () => { db.close(); resolve(operation); };
      step();
    };
  });
}

function withCartLock(work) {
  // One outstanding cart read per SPA and one initializer at a time across tabs.
  return navigator.locks
    ? navigator.locks.request("obsidian-cart", work)
    : indexedCartLock(work);
}

export async function changeSession(client, operation) {
  if (changingSession) throw new Error("Please wait for sign-in to finish.");
  changingSession = true;
  sessionRevision += 1;
  cartReady = false;
  try {
    await client.cancelQueries({
      predicate: (query) =>
        isPrivateQuery(query) || query.queryKey[0] === sessionQueryKey[0],
    });
    // A cart response can set a guest cookie and refresh can set auth cookies.
    // Let these finish before sending the request that changes identity.
    await Promise.allSettled([cartPromise, refreshPromise]);
    client.removeQueries({ predicate: isPrivateQuery });
    if (operation)
      return await withCartLock(async () => {
        try {
          return await operation();
        } finally {
          notifySessionChange();
        }
      });
  } finally {
    changingSession = false;
  }
}

async function refreshSession(identity, assertCurrent) {
  if (!refreshPromise)
    refreshPromise = withCartLock(() => {
      assertCurrent();
      return api("/auth/refresh", {
        method: "POST",
        headers: identity ? { "X-Session-Identity": identity } : {},
      });
    }).finally(
      () => (refreshPromise = null),
    );
  return refreshPromise;
}
async function csrf() {
  if (csrfToken) return csrfToken;
  if (!csrfPromise)
    csrfPromise = fetch("/api/v1/auth/csrf", { credentials: "include" })
      .then((r) => r.json())
      .then((r) => (csrfToken = r.data.csrfToken))
      .finally(() => (csrfPromise = null));
  return csrfPromise;
}
export async function api(
  path,
  { method = "GET", body, headers = {}, retry = true, signal } = {},
) {
  const revision = sessionRevision;
  const isPrivate = privatePath.test(path) || path === "/auth/password/change" ||
    (method !== "GET" && /^\/products\/[^/]+\/(?:rating|comments)$/.test(path));
  const identity = isPrivate ? requestIdentity : undefined;
  const marker = currentSessionMarker();
  const expectedHeaders = identity ? { ...headers, "X-Session-Identity": identity } : headers;
  const assertIdentity = () => {
    if (changingSession || !identity || revision !== sessionRevision ||
        sessionMarker !== currentSessionMarker())
      throw new DOMException("The session changed.", "AbortError");
  };
  const assertCurrent = () => {
    signal?.throwIfAborted();
    if (isPrivate) assertIdentity();
    if (path === sessionQueryKey[0] && marker !== currentSessionMarker())
      throw new DOMException("The session changed.", "AbortError");
  };
  assertCurrent();
  if (path === "/cart" && method === "GET") {
    const result = await readCart(identity, assertIdentity);
    assertCurrent();
    return result;
  }
  if (method !== "GET" && cartDependentPath.test(path) && (!cartReady || cartPromise)) {
    await readCart(identity, assertIdentity);
    assertCurrent();
  }
  try {
    const result = await request(path, { method, body, headers: expectedHeaders, retry, signal }, assertCurrent);
    return path === sessionQueryKey[0] ? { ...result, marker } : result;
  } catch (error) {
    if (error.code === "CART_NOT_INITIALIZED") cartReady = false;
    throw error;
  }
}

function readCart(identity, assertCurrent) {
  if (!cartPromise) {
    const read = () => withCartLock(() => request("/cart", {
      method: "GET", retry: false, headers: { "X-Session-Identity": identity },
    }, assertCurrent));
    cartPromise = (async () => {
      let cart;
      try {
        cart = await read();
      } catch (error) {
        if (error.code !== "ACCESS_EXPIRED") throw error;
        // Refresh also writes cookies and uses the same cross-tab lock.
        await refreshSession(identity, assertCurrent);
        cart = await read();
      }
      cartReady = true;
      return cart;
    })().finally(() => (cartPromise = null));
  }
  return cartPromise;
}

async function request(
  path,
  { method, body, headers, retry, signal },
  assertCurrent,
) {
  const opts = { method, credentials: "include", headers: { ...headers }, signal };
  if (method !== "GET") opts.headers["X-CSRF-Token"] = await csrf();
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers["Content-Type"] = "application/json";
  }
  assertCurrent();
  const response = await fetch(`/api/v1${path}`, opts);
  const result = response.status === 204 ? null : await response.json();
  assertCurrent();
  const retryRequest = () =>
    request(path, { method, body, headers, retry: false, signal }, assertCurrent);
  if (response.status === 403 && result?.error?.code === "CSRF" && retry) {
    csrfToken = null;
    return retryRequest();
  }
  if (response.status === 401 &&
      (!path.startsWith("/auth/") || result?.error?.code === "ACCESS_EXPIRED") &&
      retry && !changingSession) {
    try {
      await refreshSession(headers?.["X-Session-Identity"], assertCurrent);
      return retryRequest();
    } catch {}
  }
  if (
    path === "/auth/session" &&
    response.ok &&
    result.data.refreshAvailable &&
    retry && !changingSession
  ) {
    try {
      await refreshSession(undefined, assertCurrent);
      return retryRequest();
    } catch {}
  }
  if (!response.ok) {
    const error = new Error(
      result?.error?.message || "Unable to complete this request.",
    );
    Object.assign(error, result?.error, { status: response.status });
    throw error;
  }
  return result;
}
export function useScopedQuery(options, isPrivate = true) {
  const scope = useSession()?.cacheScope;
  const client = useQueryClient();
  const query = useQuery(
    isPrivate
      ? {
          retry: (count, error) =>
            count < 1 &&
            error.name !== "AbortError" &&
            !isAuthorizationError(error) && error.status !== 404,
          ...options,
          queryKey: ["private", scope, ...options.queryKey],
          enabled: !!scope && options.enabled !== false,
        }
      : options,
  );
  const denied = isAuthorizationError(query.error);
  useEffect(() => {
    if (isPrivate && scope && denied)
      void client.invalidateQueries({ queryKey: sessionQueryKey, exact: true });
  }, [client, denied, isPrivate, scope]);
  // React Query retains previous data after failed refetches. The private UI
  // should show the error without the data from an earlier successful response.
  return isPrivate && (!scope || query.isError)
    ? { ...query, data: undefined }
    : query;
}

export function useData(path, options = {}) {
  return useScopedQuery(
    { queryKey: [path], queryFn: ({ signal }) => api(path, { signal }), ...options },
    privatePath.test(path),
  );
}
export function useAction() {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(null);
  const client = useQueryClient();
  return {
    pending,
    error,
    clearError: () => setError(null),
    run: async (fn, { changesSession = false } = {}) => {
      const revision = sessionRevision;
      const stillCurrent = () => changesSession || revision === sessionRevision;
      setPending(true);
      setError(null);
      try {
        const result = await fn();
        if (!stillCurrent()) return null;
        if (!changesSession) await client.invalidateQueries();
        return stillCurrent() ? result : null;
      } catch (e) {
        if (stillCurrent()) {
          setError(e);
          if (!changesSession && isAuthorizationError(e))
            void client.invalidateQueries({ queryKey: sessionQueryKey, exact: true });
        }
        return null;
      } finally {
        setPending(false);
      }
    },
  };
}
export const money = (n) => `${Number(n || 0).toLocaleString("en-US")}₫`;
export const date = (s) =>
  new Date(s).toLocaleString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  });
export const queryString = (obj) => {
  const q = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) q.set(k, v);
  });
  return q.toString();
};
