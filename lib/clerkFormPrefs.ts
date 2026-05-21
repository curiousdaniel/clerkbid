const SUGGEST_NEXT_LOT_KEY = "clerkbid:suggestNextLot";
const STICKY_CONSIGNOR_KEY = "clerkbid:stickyConsignor";

/** Dispatched after writeSuggestNextLot (storage from other tabs also fires storage). */
export const SUGGEST_NEXT_LOT_CHANGED = "clerkbid:suggestNextLotChanged";
/** Dispatched after writeStickyConsignor. */
export const STICKY_CONSIGNOR_CHANGED = "clerkbid:stickyConsignorChanged";

/** When true (default), clerking pre-fills the next sequential lot after reset or sale. */
export function readSuggestNextLot(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SUGGEST_NEXT_LOT_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeSuggestNextLot(suggest: boolean): void {
  try {
    if (suggest) localStorage.removeItem(SUGGEST_NEXT_LOT_KEY);
    else localStorage.setItem(SUGGEST_NEXT_LOT_KEY, "0");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SUGGEST_NEXT_LOT_CHANGED));
  }
}

export function subscribeSuggestNextLot(onStoreChange: () => void): () => void {
  const fn = () => onStoreChange();
  if (typeof window !== "undefined") {
    window.addEventListener(SUGGEST_NEXT_LOT_CHANGED, fn);
    window.addEventListener("storage", fn);
    return () => {
      window.removeEventListener(SUGGEST_NEXT_LOT_CHANGED, fn);
      window.removeEventListener("storage", fn);
    };
  }
  return () => {};
}

/**
 * When true (default), the consignor selection persists across consecutive
 * sales. Clerks must explicitly clear or change it; lot autofill still
 * overwrites when the looked-up lot has a different consignor. Set to false
 * to restore the legacy behavior of clearing consignor after every sale.
 */
export function readStickyConsignor(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STICKY_CONSIGNOR_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeStickyConsignor(sticky: boolean): void {
  try {
    if (sticky) localStorage.removeItem(STICKY_CONSIGNOR_KEY);
    else localStorage.setItem(STICKY_CONSIGNOR_KEY, "0");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STICKY_CONSIGNOR_CHANGED));
  }
}

export function subscribeStickyConsignor(
  onStoreChange: () => void
): () => void {
  const fn = () => onStoreChange();
  if (typeof window !== "undefined") {
    window.addEventListener(STICKY_CONSIGNOR_CHANGED, fn);
    window.addEventListener("storage", fn);
    return () => {
      window.removeEventListener(STICKY_CONSIGNOR_CHANGED, fn);
      window.removeEventListener("storage", fn);
    };
  }
  return () => {};
}
