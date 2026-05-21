"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, ChevronRight, Ban, Pencil } from "lucide-react";
import type { AuctionEvent, Sale } from "@/lib/db";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { parseLotDisplay } from "@/lib/clerking/lotParse";
import { saleLineQuantity, saleUnitHammer } from "@/lib/services/saleLineTotals";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import { formatDateTime } from "@/lib/utils/formatDate";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SaleCorrectionModal } from "@/components/invoices/SaleCorrectionModal";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import { voidSale } from "@/lib/services/saleInvoiceEdits";

type Row = Sale & { baseLot: number };

export function RecentSales({
  event,
  currencySymbol,
  onVoided,
  onSuccess,
  onError,
}: {
  event: AuctionEvent;
  currencySymbol: string;
  onVoided?: () => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}) {
  const eventId = event.id!;
  const { db, ready } = useUserDb();
  const sales = useLiveQuery(
    async () =>
      liveQueryGuard("recentSales", async () => {
        if (!ready || !db) return [];
        const rows = await db.sales.where("eventId").equals(eventId).toArray();
        rows.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return rows.slice(0, 20).map((s) => {
          const p = parseLotDisplay(s.displayLotNumber);
          return {
            ...s,
            baseLot: p?.base ?? 0,
          } satisfies Row;
        });
      }, []),
    [ready, db, eventId]
  );

  const [openId, setOpenId] = useState<number | null>(null);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  const groups = useMemo(() => {
    if (!sales?.length) return [];
    const out: { base: number; items: Row[] }[] = [];
    for (const s of sales) {
      const last = out[out.length - 1];
      if (last && last.base === s.baseLot) {
        last.items.push(s);
      } else {
        out.push({ base: s.baseLot, items: [s] });
      }
    }
    return out;
  }, [sales]);

  async function confirmVoid() {
    if (voidTarget?.id == null || !db) return;
    const saleId = voidTarget.id;
    setVoidTarget(null);
    try {
      await voidSale(db, event, saleId);
      onVoided?.();
    } catch (e) {
      onError?.(
        e instanceof Error ? e.message : "Could not void sale."
      );
    }
  }

  if (!sales) {
    return <p className="text-sm text-muted">Loading sales…</p>;
  }

  if (sales.length === 0) {
    return (
      <p className="text-sm text-muted">No sales yet for this event.</p>
    );
  }

  return (
    <>
      <ul className="space-y-1">
        {groups.map((g) => (
          <li key={g.base}>
            <ul
              className={`rounded-lg border border-navy/10 dark:border-slate-700 ${
                g.items.length > 1
                  ? "border-l-4 border-l-gold/60 bg-amber-50/30 dark:bg-amber-950/25"
                  : "bg-white dark:bg-slate-900"
              }`}
            >
              {g.items.map((s) => {
                const expanded = openId === s.id;
                const hasSuffix =
                  (parseLotDisplay(s.displayLotNumber)?.suffix.length ?? 0) >
                  0;
                return (
                  <li
                    key={s.id}
                    className={`border-b border-navy/5 last:border-0 ${hasSuffix ? "pl-4" : ""}`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface/80 dark:hover:bg-slate-800/80"
                      onClick={() =>
                        setOpenId(expanded ? null : (s.id as number))
                      }
                    >
                      {expanded ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      )}
                      <span className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-ink">
                        <span className="font-semibold text-navy dark:text-slate-200">
                          Lot {s.displayLotNumber}
                        </span>
                        {" — "}
                        {s.description} —{" "}
                        <span className="text-gold">
                          {formatCurrency(s.amount, currencySymbol)}
                          {saleLineQuantity(s) > 1
                            ? ` (${formatCurrency(saleUnitHammer(s), currencySymbol)} × ${s.quantity})`
                            : ""}
                        </span>
                        {" — "}
                        Paddle #{s.paddleNumber} — Qty {s.quantity} —{" "}
                        {s.clerkInitials}{" "}
                        <span className="text-muted">
                          · {formatDateTime(s.createdAt)}
                        </span>
                      </span>
                    </button>
                    {expanded ? (
                      <div className="flex flex-wrap gap-2 border-t border-navy/5 px-3 py-2 pl-10">
                        <Button
                          variant="secondary"
                          type="button"
                          className="inline-flex items-center gap-1 text-sm"
                          onClick={() => setEditingSale(s)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit sale
                        </Button>
                        <Button
                          variant="danger"
                          type="button"
                          className="inline-flex items-center gap-1 text-sm"
                          onClick={() => setVoidTarget(s)}
                        >
                          <Ban className="h-4 w-4" />
                          Void sale
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={voidTarget != null}
        title="Void sale"
        message={
          voidTarget
            ? `Remove this sale for lot ${voidTarget.displayLotNumber} and mark the lot unsold?`
            : ""
        }
        confirmLabel="Void sale"
        danger
        onClose={() => setVoidTarget(null)}
        onConfirm={() => void confirmVoid()}
      />

      <SaleCorrectionModal
        open={editingSale != null}
        sale={editingSale}
        event={event}
        currencySymbol={currencySymbol}
        onClose={() => setEditingSale(null)}
        onSaved={() => onSuccess?.("Sale updated.")}
        onError={(message) => onError?.(message)}
      />
    </>
  );
}
