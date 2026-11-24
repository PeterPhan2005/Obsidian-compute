export const receiptSuccessPath = "/checkout/success";

export function setReceiptReferrerPolicy(isReceipt) {
  const head = document.head;
  let meta = head.querySelector('meta[name="referrer"]');
  if (!meta && isReceipt) {
    meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    head.append(meta);
  } else if (meta) {
    meta.content = isReceipt ? "no-referrer" : "same-origin";
  }
}

export function receiptHref(token) {
  setReceiptReferrerPolicy(true);
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
