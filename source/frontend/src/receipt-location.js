export const receiptSuccessPath = "/checkout/success";
export const resetPasswordPath = "/reset-password";

export function setSensitiveReferrerPolicy(sensitive) {
  const head = document.head;
  let meta = head.querySelector('meta[name="referrer"]');
  if (!meta && sensitive) {
    meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    head.append(meta);
  } else if (meta) {
    meta.content = sensitive ? "no-referrer" : "same-origin";
  }
}

export function receiptHref(token) {
  setSensitiveReferrerPolicy(true);
  const fragment = new URLSearchParams({ receipt: token });
  return `${receiptSuccessPath}#${fragment}`;
}

export function readReceiptToken({ hash, search }) {
  // Existing receipt links use a query parameter. New links use a fragment.
  return (
    new URLSearchParams(hash.slice(1)).get("receipt") ??
    new URLSearchParams(search).get("receipt")
  );
}

export function readResetToken({ hash, search }) {
  return (
    new URLSearchParams(hash.slice(1)).get("token") ??
    new URLSearchParams(search).get("token")
  );
}
