import type { AuctionDB, Sale } from "@/lib/db";

const REPAIR_FLAG_KEY = "clerkbid:duplicateInvoiceLinesRepaired:v1";

/**
 * One-shot data-repair pass that finds invoices where the same `lotId`
 * appears more than once across attached sales and detaches the older
 * duplicate(s). The keeper is the highest-id sale for that lot (most
 * recent write). Detached sales become unallocated and can be re-attached
 * via the next "Generate" pass; we do not delete them.
 *
 * The legacy DB v6 migration assigned every unallocated sale for a bidder
 * to every invoice for that bidder in id order, which could leave the same
 * lot duplicated on a single invoice. Multi-device generate races could
 * also produce this state. The repair is gated behind a localStorage flag
 * so it only runs once per browser profile.
 */
export async function repairDuplicateInvoiceLines(
  db: AuctionDB
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(REPAIR_FLAG_KEY) === "1") return;
  } catch {
    return;
  }

  try {
    const sales = await db.sales.toArray();
    // Group by composite "invoiceId|lotId" so we can find duplicates
    // attached to the same invoice for the same lot.
    const groups: Record<string, Sale[]> = {};
    for (const s of sales) {
      if (s.invoiceId == null) continue;
      const key = `${s.invoiceId}|${s.lotId}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }

    const detachIds: number[] = [];
    for (const key of Object.keys(groups)) {
      const lotSales = groups[key];
      if (!lotSales || lotSales.length < 2) continue;
      // Keep the most recent (highest id); detach the rest.
      lotSales.sort((a: Sale, b: Sale) => (b.id ?? 0) - (a.id ?? 0));
      for (let i = 1; i < lotSales.length; i++) {
        const sId = lotSales[i]?.id;
        if (sId != null) detachIds.push(sId);
      }
    }

    if (detachIds.length > 0) {
      await db.transaction("rw", db.sales, async () => {
        for (const id of detachIds) {
          await db.sales.update(id, { invoiceId: undefined });
        }
      });
    }
  } catch (e) {
    console.error("repairDuplicateInvoiceLines failed", e);
    return;
  }

  try {
    window.localStorage.setItem(REPAIR_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}
