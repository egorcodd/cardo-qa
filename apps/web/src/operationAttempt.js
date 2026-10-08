const records = new Map();
function identity(accountId, kind, payload) {
  return "cardo_attempt:" + accountId + ":" + kind + ":" + JSON.stringify(payload);
}
export function savedAttempt(accountId, kind, payload) {
  const id = identity(accountId, kind, payload);
  if (records.has(id)) return records.get(id);
  try {
    const key = sessionStorage.getItem(id);
    if (key) {
      records.set(id, key);
      return key;
    }
  } catch {}
  return null;
}
export function operationKey(accountId, kind, payload) {
  const id = identity(accountId, kind, payload);
  const key = savedAttempt(accountId, kind, payload) || crypto.randomUUID();
  records.set(id, key);
  try { sessionStorage.setItem(id, key); } catch {}
  return key;
}
export function clearAttempt(accountId, kind, payload) {
  const id = identity(accountId, kind, payload);
  records.delete(id);
  try { sessionStorage.removeItem(id); } catch {}
}
export function uncertainError(error) {
  return !!error.network || !error.status || error.status >= 500;
}
