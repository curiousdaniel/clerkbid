"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, FileText, CreditCard } from "lucide-react";
import type { Bidder, Invoice } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import { formatDateOnly } from "@/lib/utils/formatDate";
import { PAYMENT_METHODS } from "@/lib/utils/constants";

export type InvoiceWithBidder = Invoice & { bidder?: Bidder };

export type InvoiceSortKey =
  | "invoiceNumber"
  | "bidderName"
  | "paddle"
  | "subtotal"
  | "buyersPremium"
  | "tax"
  | "total"
  | "status";

export type SortDir = "asc" | "desc";

function paymentLabel(value: string | undefined): string {
  if (!value) return "—";
  return PAYMENT_METHODS.find((p) => p.value === value)?.label ?? value;
}

function SortableTh({
  sortKey,
  activeKey,
  dir,
  onSortChange,
  children,
  align = "left",
}: {
  sortKey: InvoiceSortKey;
  activeKey: InvoiceSortKey;
  dir: SortDir;
  onSortChange: (key: InvoiceSortKey) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const active = sortKey === activeKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`px-3 py-2 font-semibold text-navy dark:text-slate-200 ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={
        !active ? "none" : dir === "asc" ? "ascending" : "descending"
      }
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1 hover:text-ink dark:hover:text-white ${
          align === "right" ? "flex-row-reverse" : ""
        }`}
        onClick={() => onSortChange(sortKey)}
      >
        <Icon className="h-3.5 w-3.5 text-muted" aria-hidden />
        <span>{children}</span>
      </button>
    </th>
  );
}

export function InvoiceTable({
  rows,
  currencySymbol,
  sortKey,
  sortDir,
  onSortChange,
  onRowClick,
  onPrint,
  onMarkPaid,
}: {
  rows: InvoiceWithBidder[];
  currencySymbol: string;
  sortKey: InvoiceSortKey;
  sortDir: SortDir;
  onSortChange: (key: InvoiceSortKey) => void;
  onRowClick: (inv: InvoiceWithBidder) => void;
  onPrint: (inv: InvoiceWithBidder) => void;
  onMarkPaid: (inv: InvoiceWithBidder) => void;
}) {
  const sym = currencySymbol;

  return (
    <div
      className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-navy/10 bg-white [-webkit-overflow-scrolling:touch] dark:border-slate-700 dark:bg-slate-900 max-sm:-mx-4 max-sm:px-4 sm:mx-0 sm:px-0"
      role="region"
      aria-label="Invoice list"
    >
      <table className="w-full min-w-[720px] text-sm sm:min-w-[880px] md:min-w-[980px]">
        <thead className="border-b border-navy/10 bg-surface dark:border-slate-700 dark:bg-slate-800/80">
          <tr>
            <SortableTh
              sortKey="invoiceNumber"
              activeKey={sortKey}
              dir={sortDir}
              onSortChange={onSortChange}
            >
              Invoice #
            </SortableTh>
            <SortableTh
              sortKey="bidderName"
              activeKey={sortKey}
              dir={sortDir}
              onSortChange={onSortChange}
            >
              Bidder
            </SortableTh>
            <SortableTh
              sortKey="paddle"
              activeKey={sortKey}
              dir={sortDir}
              onSortChange={onSortChange}
              align="right"
            >
              Paddle
            </SortableTh>
            <SortableTh
              sortKey="subtotal"
              activeKey={sortKey}
              dir={sortDir}
              onSortChange={onSortChange}
              align="right"
            >
              Hammer
            </SortableTh>
            <SortableTh
              sortKey="buyersPremium"
              activeKey={sortKey}
              dir={sortDir}
              onSortChange={onSortChange}
              align="right"
            >
              Buyer prem.
            </SortableTh>
            <SortableTh
              sortKey="tax"
              activeKey={sortKey}
              dir={sortDir}
              onSortChange={onSortChange}
              align="right"
            >
              Tax
            </SortableTh>
            <SortableTh
              sortKey="total"
              activeKey={sortKey}
              dir={sortDir}
              onSortChange={onSortChange}
              align="right"
            >
              Total
            </SortableTh>
            <SortableTh
              sortKey="status"
              activeKey={sortKey}
              dir={sortDir}
              onSortChange={onSortChange}
            >
              Status
            </SortableTh>
            <th className="px-3 py-2 text-left font-semibold text-navy dark:text-slate-200">
              Payment
            </th>
            <th className="px-3 py-2 text-right font-semibold text-navy dark:text-slate-200">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy/10 dark:divide-slate-700">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-3 py-8 text-center text-muted">
                No invoices match this filter.
              </td>
            </tr>
          ) : (
            rows.map((inv) => (
              <tr
                key={inv.id}
                className="cursor-pointer hover:bg-surface/60 dark:hover:bg-slate-800/60"
                onClick={() => onRowClick(inv)}
              >
                <td className="px-3 py-2 font-mono font-medium text-navy dark:text-slate-200">
                  {inv.invoiceNumber}
                </td>
                <td className="px-3 py-2">
                  {inv.bidder ? (
                    <span className="text-ink dark:text-slate-100">
                      {inv.bidder.firstName} {inv.bidder.lastName}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted">
                  {inv.bidder ? `#${inv.bidder.paddleNumber}` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatCurrency(inv.subtotal, sym)}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatCurrency(inv.buyersPremiumAmount, sym)}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatCurrency(inv.taxAmount, sym)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-gold">
                  {formatCurrency(inv.total, sym)}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={inv.status === "paid" ? "success" : "warning"}>
                    {inv.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-muted">
                  {inv.status === "paid" ? (
                    <span className="text-xs">
                      {paymentLabel(inv.paymentMethod)}
                      {inv.paymentDate
                        ? ` · ${formatDateOnly(inv.paymentDate)}`
                        : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    type="button"
                    className="!p-1.5"
                    aria-label="Print invoice"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPrint(inv);
                    }}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  {inv.status === "unpaid" ? (
                    <Button
                      variant="ghost"
                      type="button"
                      className="!p-1.5"
                      aria-label="Mark paid"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkPaid(inv);
                      }}
                    >
                      <CreditCard className="h-4 w-4" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function compareInvoiceRows(
  a: InvoiceWithBidder,
  b: InvoiceWithBidder,
  key: InvoiceSortKey
): number {
  switch (key) {
    case "invoiceNumber":
      return (a.invoiceNumber ?? "").localeCompare(
        b.invoiceNumber ?? "",
        undefined,
        { numeric: true }
      );
    case "bidderName": {
      const an = a.bidder
        ? `${a.bidder.lastName} ${a.bidder.firstName}`.trim()
        : "";
      const bn = b.bidder
        ? `${b.bidder.lastName} ${b.bidder.firstName}`.trim()
        : "";
      return an.localeCompare(bn, undefined, { sensitivity: "base" });
    }
    case "paddle":
      return (
        (a.bidder?.paddleNumber ?? Number.POSITIVE_INFINITY) -
        (b.bidder?.paddleNumber ?? Number.POSITIVE_INFINITY)
      );
    case "subtotal":
      return a.subtotal - b.subtotal;
    case "buyersPremium":
      return a.buyersPremiumAmount - b.buyersPremiumAmount;
    case "tax":
      return a.taxAmount - b.taxAmount;
    case "total":
      return a.total - b.total;
    case "status":
      // unpaid before paid for asc (unpaid is the actionable state)
      return a.status === b.status ? 0 : a.status === "unpaid" ? -1 : 1;
    default:
      return 0;
  }
}
