import type { AuctionEvent, Invoice, Sale } from "@/lib/db";
import {
  computeInvoiceTotalsFromParts,
  roundMoney,
} from "@/lib/services/invoiceLogic";

export type PaddleTallyState = {
  hammer: number;
  buyersPremium: number;
  tax: number;
  total: number;
  unallocatedHammer: number;
  unallocatedBuyersPremium: number;
  unallocatedTax: number;
  unallocatedTotal: number;
  pendingLines: number;
  hasUnpaidInvoice: boolean;
  hasPaidInvoice: boolean;
  hasUnallocated: boolean;
};

/**
 * Builds a live tally for a single bidder/paddle combining:
 * - Allocated invoices (their authoritative buyersPremium / tax / total).
 * - Unallocated sale lines projected through the event's BP/tax rates.
 *
 * `total` is invoice totals + projected total of unallocated lines, so
 * the cashier sees the running grand total even before invoices are
 * generated for new lots.
 */
export function buildPaddleTally(
  sales: Sale[],
  invoices: Invoice[],
  event: AuctionEvent
): PaddleTallyState {
  const hammerAll = roundMoney(sales.reduce((a, s) => a + s.amount, 0));
  const bpAll = roundMoney(
    invoices.reduce((a, i) => a + i.buyersPremiumAmount, 0)
  );
  const taxAll = roundMoney(invoices.reduce((a, i) => a + i.taxAmount, 0));
  const totalAll = roundMoney(invoices.reduce((a, i) => a + i.total, 0));
  const unallocatedSales = sales.filter((s) => s.invoiceId == null);
  const unallocatedHammer = roundMoney(
    unallocatedSales.reduce((a, s) => a + s.amount, 0)
  );
  const projected = computeInvoiceTotalsFromParts(
    unallocatedHammer,
    undefined,
    {} as Pick<Invoice, "buyersPremiumRate" | "taxRate">,
    event
  );
  return {
    hammer: hammerAll,
    buyersPremium: bpAll,
    tax: taxAll,
    total: roundMoney(totalAll + projected.total),
    unallocatedHammer,
    unallocatedBuyersPremium: projected.buyersPremiumAmount,
    unallocatedTax: projected.taxAmount,
    unallocatedTotal: projected.total,
    pendingLines: unallocatedSales.length,
    hasUnpaidInvoice: invoices.some((i) => i.status === "unpaid"),
    hasPaidInvoice: invoices.some((i) => i.status === "paid"),
    hasUnallocated: unallocatedSales.length > 0,
  };
}
