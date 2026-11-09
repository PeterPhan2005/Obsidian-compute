import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
let csrfToken, csrfPromise, refreshPromise;
async function refreshSession() {
  if (!refreshPromise)
    refreshPromise = api("/auth/refresh", { method: "POST" }).finally(
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
  { method = "GET", body, headers = {}, retry = true } = {},
) {
  const opts = { method, credentials: "include", headers: { ...headers } };
  if (method !== "GET") opts.headers["X-CSRF-Token"] = await csrf();
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api/v1${path}`, opts);
  const result = response.status === 204 ? null : await response.json();
  if (response.status === 403 && result?.error?.code === "CSRF" && retry) {
    csrfToken = null;
    return api(path, { method, body, headers, retry: false });
  }
  if (response.status === 401 && !path.startsWith("/auth/") && retry) {
    try {
      await refreshSession();
      return api(path, { method, body, headers, retry: false });
    } catch {}
  }
  if (
    path === "/auth/session" &&
    response.ok &&
    result.data.refreshAvailable &&
    retry
  ) {
    try {
      await refreshSession();
      return api(path, { retry: false });
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
export function useData(path, options = {}) {
  return useQuery({ queryKey: [path], queryFn: () => api(path), ...options });
}
export function useAction() {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(null);
  const client = useQueryClient();
  return {
    pending,
    error,
    clearError: () => setError(null),
    run: async (fn) => {
      setPending(true);
      setError(null);
      try {
        const result = await fn();
        await client.invalidateQueries();
        return result;
      } catch (e) {
        setError(e);
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
