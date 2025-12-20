export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return { supported: false, persisted: null };

    const already = await navigator.storage.persisted();
    if (already) return { supported: true, persisted: true };

    const granted = await navigator.storage.persist();
    return { supported: true, persisted: granted };
  } catch {
    return { supported: true, persisted: null };
  }
}
