import type { AuctionDB, AuctionEvent, Sale } from "@/lib/db";
import { mutateWithEventTables } from "@/lib/db/mutateWithParentEventTouch";
import {
  recalculateAndPersistInvoice,
  roundMoney,
  upsertInvoiceForBidder,
} from "@/lib/services/invoiceLogic";
import {
  enqueueInvoicePut,
  enqueueSaleDelete,
  enqueueSalePut,
  ensureSaleSyncKey,
} from "@/lib/sync/ops/enqueueOps";

/**
 * Voids a sale: deletes the sale row, marks the lot unsold, recomputes
 * any attached invoice (paid invoices are skipped — caller should mark
 * unpaid first if needed), and enqueues the appropriate cloud sync ops.
 *
 * Throws when the sale belongs to a paid invoice — caller is expected to
 * gate the UI by checking `sale.invoiceId`'s status before opening the
 * void confirmation. If the underlying invoice has been marked paid in
 * the meantime, this is a no-op that throws clearly.
 */
export async function voidSale(
  db: AuctionDB,
  event: AuctionEvent,
  saleId: number
): Promise<void> {
  const sale = await db.sales.get(saleId);
  if (sale?.id == null) {
    throw new Error("Sale not found.");
  }
  if (sale.invoiceId != null) {
    const inv = await db.invoices.get(sale.invoiceId);
    if (inv?.status === "paid") {
      throw new Error(
        "Cannot void a sale on a paid invoice. Mark the invoice unpaid first."
      );
    }
  }
  const lotId = sale.lotId;
  const invoiceId = sale.invoiceId;
  const saleSyncKey = await ensureSaleSyncKey(db, saleId);
  await mutateWithEventTables(
    db,
    event.id!,
    [db.lots, db.sales],
    async () => {
      await db.sales.delete(saleId);
      if (lotId != null) {
        await db.lots.update(lotId, {
          status: "unsold",
          updatedAt: new Date(),
        });
      }
    }
  );
  if (invoiceId != null) {
    await recalculateAndPersistInvoice(db, invoiceId, event);
    if (event.syncId) {
      await enqueueInvoicePut(db, event.syncId, invoiceId);
    }
  }
  if (event.syncId && saleSyncKey) {
    await enqueueSaleDelete(db, event.syncId, saleSyncKey);
  }
}

export async function removeSaleFromInvoice(
  db: AuctionDB,
  event: AuctionEvent,
  saleId: number,
  invoiceId: number
): Promise<void> {
  const inv = await db.invoices.get(invoiceId);
  if (inv?.id == null) {
    throw new Error("Invoice not found.");
  }
  if (inv.status === "paid") {
    throw new Error("Cannot remove lines from a paid invoice.");
  }
  const sale = await db.sales.get(saleId);
  if (sale?.id == null || sale.invoiceId !== invoiceId) {
    throw new Error("This line is not on the current invoice.");
  }
  const evId = inv.eventId;
  await mutateWithEventTables(db, evId, [db.sales], async () => {
    await db.sales.update(saleId, { invoiceId: null });
  });
  const saleAfter = await db.sales.get(saleId);
  if (saleAfter && event.syncId) {
    await enqueueSalePut(db, event.syncId, saleAfter);
  }
  await recalculateAndPersistInvoice(db, invoiceId, event);
  if (event.syncId) {
    await enqueueInvoicePut(db, event.syncId, invoiceId);
  }
}

export type SaleCorrectionInput = {
  description: string;
  quantity: number;
  /** Line hammer total (unit × quantity). */
  amount: number;
  paddleNumber: number;
  bidderId: number;
  consignor?: string;
  consignorId: number | null;
  clerkInitials: string;
};

export type PersistSaleCorrectionOptions = {
  /**
   * When editing from a specific invoice modal, require `sale.invoiceId` to match.
   * Omit when editing from clerking (recent sales) so unallocated lines work.
   */
  anchorInvoiceId?: number;
  /**
   * Stable sync identity for sale row. Used as a fallback when a local numeric id
   * changes during cloud reconciliation while the correction modal is open.
   */
  saleSyncKey?: string;
};

function buildCorrectedSaleRow(
  sale: Sale,
  input: SaleCorrectionInput
): { next: Sale; bidderChanged: boolean } {
  const qty = Math.max(1, Math.floor(Number(input.quantity)) || 1);
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Line total must be a non-negative number.");
  }
  const bidderChanged = input.bidderId !== sale.bidderId;
  const next: Sale = {
    ...sale,
    description: input.description.trim(),
    quantity: qty,
    amount,
    paddleNumber: input.paddleNumber,
    bidderId: input.bidderId,
    consignor: input.consignor?.trim() || undefined,
    clerkInitials: input.clerkInitials.trim().toUpperCase().slice(0, 3),
  };
  if (input.consignorId != null) {
    next.consignorId = input.consignorId;
  } else {
    delete next.consignorId;
  }
  return { next, bidderChanged };
}

/**
 * Updates a sale (clerking recent sales or invoice detail).
 * - Unallocated (`invoiceId` null): save only; if bidder changes, `upsertInvoiceForBidder` for the new bidder.
 * - On unpaid invoice: recalc that invoice; bidder change unallocates then recalc + upsert new bidder.
 * - On paid invoice: throws (mark unpaid first).
 * Use `anchorInvoiceId` when opened from invoice detail so stale rows are rejected.
 */
export async function persistSaleCorrection(
  db: AuctionDB,
  event: AuctionEvent,
  saleId: number,
  input: SaleCorrectionInput,
  options?: PersistSaleCorrectionOptions
): Promise<void> {
  const eventId = event.id;
  if (eventId == null) throw new Error("Event not loaded.");
  let effectiveSaleId = saleId;
  let sale = await db.sales.get(saleId);
  if (sale?.id == null && options?.saleSyncKey) {
    const bySyncKey = await db.sales
      .where("eventId")
      .equals(eventId)
      .filter((row) => row.syncKey === options.saleSyncKey)
      .first();
    if (bySyncKey?.id != null) {
      sale = bySyncKey;
      effectiveSaleId = bySyncKey.id;
    }
  }
  if (sale?.id == null) throw new Error("Sale not found.");

  if (options?.anchorInvoiceId != null) {
    if (sale.invoiceId !== options.anchorInvoiceId) {
      throw new Error(
        "This sale is no longer on this invoice. Close and reopen the invoice."
      );
    }
  }

  const { next, bidderChanged } = buildCorrectedSaleRow(sale, input);

  const attachedId = sale.invoiceId;

  if (attachedId == null) {
    await mutateWithEventTables(db, eventId, [db.sales], async () => {
      await db.sales.put(next);
    });
    if (event.syncId) {
      const fresh = await db.sales.get(effectiveSaleId);
      if (fresh) await enqueueSalePut(db, event.syncId, fresh);
    }
    if (bidderChanged) {
      await upsertInvoiceForBidder(db, event, input.bidderId);
    }
    return;
  }

  const inv = await db.invoices.get(attachedId);
  if (inv?.id == null) {
    next.invoiceId = null;
    await mutateWithEventTables(db, eventId, [db.sales], async () => {
      await db.sales.put(next);
    });
    if (event.syncId) {
      const fresh = await db.sales.get(effectiveSaleId);
      if (fresh) await enqueueSalePut(db, event.syncId, fresh);
    }
    if (bidderChanged) {
      await upsertInvoiceForBidder(db, event, input.bidderId);
    }
    return;
  }

  if (inv.status === "paid") {
    throw new Error(
      "Mark the invoice unpaid before editing this sale (Invoices → invoice detail → Mark as unpaid)."
    );
  }

  if (bidderChanged) {
    next.invoiceId = null;
  }

  await mutateWithEventTables(db, eventId, [db.sales], async () => {
    await db.sales.put(next);
  });

  if (bidderChanged) {
    await recalculateAndPersistInvoice(db, attachedId, event);
    await upsertInvoiceForBidder(db, event, input.bidderId);
  } else {
    await recalculateAndPersistInvoice(db, attachedId, event);
  }
  if (event.syncId) {
    const fresh = await db.sales.get(effectiveSaleId);
    if (fresh) await enqueueSalePut(db, event.syncId, fresh);
    await enqueueInvoicePut(db, event.syncId, attachedId);
  }
}
