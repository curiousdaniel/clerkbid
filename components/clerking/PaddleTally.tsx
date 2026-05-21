"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { AuctionEvent, Bidder, Invoice, Sale } from "@/lib/db";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import {
  buildPaddleTally,
  type PaddleTallyState,
} from "@/lib/services/paddleTally";
import { formatCurrency } from "@/lib/utils/formatCurrency";

type Snapshot = {
  bidder: Bidder | null;
  sales: Sale[];
  invoices: Invoice[];
};

export function PaddleTally({ event }: { event: AuctionEvent }) {
  const { db, ready } = useUserDb();
  const [paddle, setPaddle] = useState("");
  const eventId = event.id!;
  const sym = event.currencySymbol ?? "$";
  const trimmed = paddle.trim();
  const paddleNum = trimmed === "" ? null : Number(trimmed);

  const snapshot = useLiveQuery(
    async () =>
      liveQueryGuard<Snapshot | null>(
        "paddleTally.snapshot",
        async () => {
          if (!ready || !db) return null;
          if (paddleNum == null || !Number.isFinite(paddleNum) || paddleNum < 1) {
            return null;
          }
          const bidder = await db.bidders
            .where("[eventId+paddleNumber]")
            .equals([eventId, paddleNum])
            .first();
          if (!bidder?.id) return { bidder: null, sales: [], invoices: [] };
          const [sales, invoices] = await Promise.all([
            db.sales.where("bidderId").equals(bidder.id).toArray(),
            db.invoices.where("bidderId").equals(bidder.id).toArray(),
          ]);
          return { bidder, sales, invoices };
        },
        null
      ),
    [ready, db, eventId, paddleNum]
  );

  const tally = useMemo<PaddleTallyState | null>(
    () =>
      snapshot ? buildPaddleTally(snapshot.sales, snapshot.invoices, event) : null,
    [snapshot, event]
  );

  const sortedSales = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.sales].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    });
  }, [snapshot]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100">
          Paddle tally
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          Live winning bids and running total for any paddle.
        </p>
      </div>
      <Input
        id="paddle-tally-paddle"
        label="Paddle #"
        inputMode="numeric"
        value={paddle}
        onChange={(e) => setPaddle(e.target.value)}
        className="font-mono"
        autoComplete="off"
      />
      {paddleNum == null ? (
        <p className="text-xs text-muted">Enter a paddle number to see what they&apos;ve won.</p>
      ) : !snapshot ? (
        <p className="text-xs text-muted">Looking up…</p>
      ) : !snapshot.bidder ? (
        <p className="text-xs text-muted">No bidder registered with paddle #{paddleNum}.</p>
      ) : (
        <PaddleTallyBody
          bidder={snapshot.bidder}
          sales={sortedSales}
          tally={tally!}
          sym={sym}
        />
      )}
    </div>
  );
}

function PaddleTallyBody({
  bidder,
  sales,
  tally,
  sym,
}: {
  bidder: Bidder;
  sales: Sale[];
  tally: PaddleTallyState;
  sym: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-navy/15 bg-surface px-3 py-2 dark:border-slate-600 dark:bg-slate-800/60">
        <div>
          <p className="text-sm font-medium text-navy dark:text-slate-100">
            {bidder.firstName} {bidder.lastName}
          </p>
          <p className="font-mono text-xs text-muted">
            Paddle #{bidder.paddleNumber}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {tally.hasPaidInvoice ? (
            <Badge tone="success">Paid invoice on file</Badge>
          ) : null}
          {tally.hasUnpaidInvoice ? (
            <Badge tone="warning">Unpaid invoice</Badge>
          ) : null}
          {tally.hasUnallocated ? (
            <Badge tone="warning">{tally.pendingLines} pending line(s)</Badge>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Items won</dt>
        <dd className="text-right font-mono">{sales.length}</dd>
        <dt className="text-muted">Hammer</dt>
        <dd className="text-right font-mono">
          {formatCurrency(tally.hammer, sym)}
        </dd>
        {tally.hasUnallocated ? (
          <>
            <dt className="text-muted">Pending hammer</dt>
            <dd className="text-right font-mono">
              {formatCurrency(tally.unallocatedHammer, sym)}
            </dd>
            <dt className="text-muted">Pending BP</dt>
            <dd className="text-right font-mono">
              {formatCurrency(tally.unallocatedBuyersPremium, sym)}
            </dd>
            <dt className="text-muted">Pending tax</dt>
            <dd className="text-right font-mono">
              {formatCurrency(tally.unallocatedTax, sym)}
            </dd>
          </>
        ) : null}
        <dt className="font-semibold text-ink dark:text-slate-100">Projected total</dt>
        <dd className="text-right font-mono font-semibold text-gold">
          {formatCurrency(tally.total, sym)}
        </dd>
      </dl>

      {sales.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-navy/10 dark:border-slate-700">
          <ul className="max-h-64 divide-y divide-navy/10 overflow-y-auto text-xs dark:divide-slate-700">
            {sales.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-1.5"
              >
                <span className="font-mono font-semibold text-navy dark:text-slate-200">
                  {s.displayLotNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink dark:text-slate-200">
                  {s.description}
                </span>
                <span className="font-mono text-gold">
                  {formatCurrency(s.amount, sym)}
                </span>
                {s.invoiceId == null ? (
                  <span className="font-mono text-[10px] uppercase text-muted">
                    pending
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted">No winning bids yet for this paddle.</p>
      )}
    </div>
  );
}
