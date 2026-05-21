"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SaleCorrectionModal } from "@/components/invoices/SaleCorrectionModal";
import { useCurrentEvent } from "@/lib/hooks/useCurrentEvent";
import { useToast } from "@/components/providers/ToastProvider";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { useCloudSync } from "@/components/providers/CloudSyncProvider";
import { downloadCsv } from "@/lib/services/csvExporter";
import { parseLotCsv } from "@/lib/services/csvImportLots";
import { mutateWithEventTables } from "@/lib/db/mutateWithParentEventTouch";
import { liveQueryGuard } from "@/lib/dexie/liveQueryGuard";
import { compareLotsForReport } from "@/lib/services/reportCalculator";
import { voidSale } from "@/lib/services/saleInvoiceEdits";
import { saleLineQuantity, saleUnitHammer } from "@/lib/services/saleLineTotals";
import { formatCurrency } from "@/lib/utils/formatCurrency";
import { formatDateTime } from "@/lib/utils/formatDate";
import type { Bidder, Lot, Sale } from "@/lib/db";

const linkSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-navy/15 bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-navy/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:focus-visible:ring-offset-slate-950";

const LOT_CSV_HEADERS = [
  "lot",
  "suffix",
  "description",
  "consignor",
  "consignor number",
  "quantity",
  "notes",
] as const;

type StatusFilter = "all" | "sold" | "unsold" | "passed" | "withdrawn";

type SortKey =
  | "lot"
  | "description"
  | "qty"
  | "status"
  | "paddle"
  | "hammer"
  | "consignor";

type SortDir = "asc" | "desc";

type LotRow = {
  lot: Lot;
  sale: Sale | null;
  buyer: Bidder | null;
  consignorLabel: string;
};

function statusTone(
  status: Lot["status"]
): "success" | "neutral" | "warning" {
  if (status === "sold") return "success";
  if (status === "unsold") return "neutral";
  return "warning";
}

function compareString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function compareNullable(
  a: number | null | undefined,
  b: number | null | undefined
): number {
  const av = a ?? null;
  const bv = b ?? null;
  if (av === bv) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return av - bv;
}

function compareRows(a: LotRow, b: LotRow, key: SortKey): number {
  switch (key) {
    case "lot":
      return compareLotsForReport(a.lot, b.lot);
    case "description":
      return compareString(a.lot.description, b.lot.description);
    case "qty":
      return a.lot.quantity - b.lot.quantity;
    case "status":
      return compareString(a.lot.status, b.lot.status);
    case "paddle":
      return compareNullable(
        a.sale?.paddleNumber ?? null,
        b.sale?.paddleNumber ?? null
      );
    case "hammer":
      return compareNullable(
        a.sale?.amount ?? null,
        b.sale?.amount ?? null
      );
    case "consignor":
      return compareString(a.consignorLabel, b.consignorLabel);
    default:
      return 0;
  }
}

function SortHeader({
  active,
  dir,
  onClick,
  children,
  align = "left",
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`px-3 py-2 font-semibold text-navy dark:text-slate-200 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${
          align === "right" ? "flex-row-reverse" : ""
        } hover:text-ink dark:hover:text-white`}
      >
        <Icon className="h-3.5 w-3.5 text-muted" aria-hidden />
        <span>{children}</span>
      </button>
    </th>
  );
}

export default function LotsPage() {
  const { db, ready } = useUserDb();
  const { scheduleCloudPush } = useCloudSync();
  const { currentEvent, currentEventId } = useCurrentEvent();
  const { showToast } = useToast();
  const csvRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lot");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [openLotId, setOpenLotId] = useState<number | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);

  const lots = useLiveQuery(
    async () =>
      liveQueryGuard("lotsPage.allLots", async () => {
        if (!ready || !db || currentEventId == null) return [];
        const rows = await db.lots
          .where("eventId")
          .equals(currentEventId)
          .toArray();
        return [...rows].sort(compareLotsForReport);
      }, []),
    [ready, db, currentEventId]
  );

  const sales = useLiveQuery(
    async () =>
      liveQueryGuard("lotsPage.allSales", async () => {
        if (!ready || !db || currentEventId == null) return [];
        return db.sales.where("eventId").equals(currentEventId).toArray();
      }, []),
    [ready, db, currentEventId]
  );

  const bidders = useLiveQuery(
    async () =>
      liveQueryGuard("lotsPage.allBidders", async () => {
        if (!ready || !db || currentEventId == null) return [];
        return db.bidders.where("eventId").equals(currentEventId).toArray();
      }, []),
    [ready, db, currentEventId]
  );

  const consignors = useLiveQuery(
    async () =>
      liveQueryGuard("lotsPage.consignors", async () => {
        if (!ready || !db || currentEventId == null) return [];
        return db.consignors.where("eventId").equals(currentEventId).toArray();
      }, []),
    [ready, db, currentEventId]
  );

  const consignorNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of consignors ?? []) {
      if (c.id != null) m.set(c.id, c.name);
    }
    return m;
  }, [consignors]);

  // Build the joined rows once. Live queries keep this fresh.
  const rows = useMemo<LotRow[]>(() => {
    if (!lots) return [];
    const saleByLotId = new Map<number, Sale>();
    for (const s of sales ?? []) {
      if (s.lotId == null) continue;
      // Prefer the highest-id sale per lot if duplicates exist (defensive).
      const existing = saleByLotId.get(s.lotId);
      if (
        !existing ||
        ((s.id ?? 0) > (existing.id ?? 0))
      ) {
        saleByLotId.set(s.lotId, s);
      }
    }
    const bidderById = new Map<number, Bidder>();
    for (const b of bidders ?? []) {
      if (b.id != null) bidderById.set(b.id, b);
    }
    return lots.map((l) => {
      const sale =
        l.id != null ? saleByLotId.get(l.id) ?? null : null;
      const buyer =
        sale?.bidderId != null ? bidderById.get(sale.bidderId) ?? null : null;
      const consignorLabel =
        l.consignor ??
        (l.consignorId != null
          ? consignorNameById.get(l.consignorId) ?? ""
          : "");
      return { lot: l, sale, buyer, consignorLabel };
    });
  }, [lots, sales, bidders, consignorNameById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (statusFilter !== "all") {
      out = out.filter((r) => r.lot.status === statusFilter);
    }
    if (q) {
      out = out.filter((r) => {
        const buyerName = r.buyer
          ? `${r.buyer.firstName} ${r.buyer.lastName}`
          : "";
        const blob = [
          r.lot.displayLotNumber,
          r.lot.description,
          r.consignorLabel,
          r.lot.notes ?? "",
          r.sale?.paddleNumber != null ? String(r.sale.paddleNumber) : "",
          buyerName,
          r.sale?.clerkInitials ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }
    return [...out].sort((a, b) => {
      const cmp = compareRows(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }

  async function handleVoid() {
    if (!db || voidTarget?.id == null || !currentEvent) return;
    const target = voidTarget;
    setVoidTarget(null);
    try {
      await voidSale(db, currentEvent, target.id!);
      scheduleCloudPush();
      showToast({
        kind: "success",
        message: `Voided sale on lot ${target.displayLotNumber}.`,
      });
    } catch (e) {
      showToast({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not void sale.",
      });
    }
  }

  if (currentEventId == null || !currentEvent) {
    return (
      <div>
        <Header
          title="Lots"
          description="Select an event in the sidebar to manage the catalog."
          actions={
            <Link href="/events/" className={linkSecondary}>
              Events
            </Link>
          }
        />
        <p className="text-sm text-muted">No event selected.</p>
      </div>
    );
  }

  const sym = currentEvent.currencySymbol ?? "$";
  const totalCount = rows.length;

  return (
    <div>
      <Header
        title="Lots"
        description={`Catalog for ${currentEvent.name}. Search any lot, see full sale details, and edit or void historical sales.`}
        actions={
          <>
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || !db || currentEventId == null) return;
                try {
                  const text = await file.text();
                  const { rows: parsedRows, issues } = parseLotCsv(text);
                  const existing = await db.lots
                    .where("eventId")
                    .equals(currentEventId)
                    .toArray();
                  const takenDisplays = new Set(
                    existing.map((l) => l.displayLotNumber)
                  );
                  const consignorRows = await db.consignors
                    .where("eventId")
                    .equals(currentEventId)
                    .toArray();
                  const consignorIdByNumber = new Map(
                    consignorRows
                      .filter((c) => c.id != null)
                      .map((c) => [c.consignorNumber, c.id!])
                  );

                  const conflicts: string[] = [];
                  const badConsignorRows: string[] = [];
                  const toAdd = parsedRows.filter((r) => {
                    if (takenDisplays.has(r.displayLotNumber)) {
                      conflicts.push(r.displayLotNumber);
                      return false;
                    }
                    if (r.consignorNumber != null) {
                      const cid = consignorIdByNumber.get(r.consignorNumber);
                      if (cid == null) {
                        badConsignorRows.push(
                          `${r.displayLotNumber} (consignor #${r.consignorNumber})`
                        );
                        return false;
                      }
                    }
                    takenDisplays.add(r.displayLotNumber);
                    return true;
                  });

                  const now = new Date();
                  await mutateWithEventTables(
                    db,
                    currentEventId,
                    [db.lots],
                    async () => {
                      for (const r of toAdd) {
                        const row: Omit<Lot, "id"> = {
                          eventId: currentEventId,
                          baseLotNumber: r.baseLotNumber,
                          lotSuffix: r.lotSuffix,
                          displayLotNumber: r.displayLotNumber,
                          description: r.description,
                          quantity: r.quantity,
                          status: "unsold",
                          createdAt: now,
                          updatedAt: now,
                        };
                        if (r.consignor) row.consignor = r.consignor;
                        if (r.notes) row.notes = r.notes;
                        if (r.consignorNumber != null) {
                          const cid = consignorIdByNumber.get(
                            r.consignorNumber
                          );
                          if (cid != null) row.consignorId = cid;
                        }
                        await db.lots.add(row);
                      }
                    }
                  );
                  if (toAdd.length > 0) scheduleCloudPush();
                  const parts: string[] = [];
                  if (toAdd.length)
                    parts.push(`Imported ${toAdd.length} lot(s).`);
                  if (issues.length)
                    parts.push(`${issues.length} row issue(s) in file.`);
                  if (conflicts.length)
                    parts.push(
                      `Skipped ${conflicts.length} lot(s) already in this event.`
                    );
                  if (badConsignorRows.length)
                    parts.push(
                      `Skipped ${badConsignorRows.length} row(s) with unknown consignor number.`
                    );
                  const ok =
                    toAdd.length > 0 &&
                    issues.length === 0 &&
                    conflicts.length === 0 &&
                    badConsignorRows.length === 0;
                  showToast({
                    kind: ok ? "success" : toAdd.length > 0 ? "info" : "error",
                    message: parts.join(" ") || "Nothing imported.",
                  });
                } catch (err) {
                  showToast({
                    kind: "error",
                    message:
                      err instanceof Error ? err.message : "CSV import failed.",
                  });
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                downloadCsv(
                  "clerkbid-lots-template.csv",
                  [...LOT_CSV_HEADERS],
                  [
                    [
                      12,
                      "",
                      "Example lot description",
                      "",
                      "",
                      1,
                      "",
                    ],
                  ]
                )
              }
            >
              Lot CSV template
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => csvRef.current?.click()}
            >
              Import lots (CSV)
            </Button>
          </>
        }
      />

      <p className="mb-4 max-w-2xl text-sm text-muted">
        Required columns: <span className="font-mono">baseLotNumber</span>,{" "}
        <span className="font-mono">description</span>. Optional:{" "}
        <span className="font-mono">lotSuffix</span>,{" "}
        <span className="font-mono">consignor</span>,{" "}
        <span className="font-mono">consignorNumber</span> (must match a
        registered consignor), <span className="font-mono">quantity</span>,{" "}
        <span className="font-mono">notes</span>.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[260px] max-w-md flex-1">
          <Input
            id="lots-search"
            label="Search lots"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Lot #, description, consignor, paddle, buyer name…"
          />
        </div>
        <div>
          <label
            htmlFor="lots-status-filter"
            className="mb-1 block text-sm font-medium text-ink dark:text-slate-200"
          >
            Status
          </label>
          <select
            id="lots-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">All</option>
            <option value="sold">Sold</option>
            <option value="unsold">Unsold</option>
            <option value="passed">Passed</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>
        <p className="ml-auto self-center text-xs text-muted">
          Showing {filtered.length} of {totalCount}
        </p>
      </div>

      {!lots ? (
        <p className="text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">
          {totalCount === 0
            ? "No lots yet. Import a CSV or record sales on the Clerking page."
            : "No lots match your filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-navy/10 dark:border-slate-700">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="bg-surface dark:bg-slate-800/80">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <SortHeader
                  active={sortKey === "lot"}
                  dir={sortDir}
                  onClick={() => toggleSort("lot")}
                >
                  Lot #
                </SortHeader>
                <SortHeader
                  active={sortKey === "description"}
                  dir={sortDir}
                  onClick={() => toggleSort("description")}
                >
                  Description
                </SortHeader>
                <SortHeader
                  active={sortKey === "qty"}
                  dir={sortDir}
                  onClick={() => toggleSort("qty")}
                  align="right"
                >
                  Qty
                </SortHeader>
                <SortHeader
                  active={sortKey === "status"}
                  dir={sortDir}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </SortHeader>
                <SortHeader
                  active={sortKey === "paddle"}
                  dir={sortDir}
                  onClick={() => toggleSort("paddle")}
                  align="right"
                >
                  Paddle
                </SortHeader>
                <SortHeader
                  active={sortKey === "hammer"}
                  dir={sortDir}
                  onClick={() => toggleSort("hammer")}
                  align="right"
                >
                  Hammer
                </SortHeader>
                <SortHeader
                  active={sortKey === "consignor"}
                  dir={sortDir}
                  onClick={() => toggleSort("consignor")}
                >
                  Consignor
                </SortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10 dark:divide-slate-700">
              {filtered.map((r) => {
                const lotKey = r.lot.id ?? -1;
                const expanded = openLotId === lotKey;
                return (
                  <FragmentRow
                    key={r.lot.id ?? r.lot.displayLotNumber}
                    row={r}
                    sym={sym}
                    expanded={expanded}
                    onToggle={() =>
                      setOpenLotId(expanded ? null : lotKey)
                    }
                    onEdit={(s) => setEditingSale(s)}
                    onVoid={(s) => setVoidTarget(s)}
                    consignorNameById={consignorNameById}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SaleCorrectionModal
        open={editingSale != null}
        sale={editingSale}
        event={currentEvent}
        currencySymbol={sym}
        onClose={() => setEditingSale(null)}
        onSaved={() => {
          showToast({ kind: "success", message: "Sale updated." });
          scheduleCloudPush();
          setEditingSale(null);
        }}
        onError={(message) => showToast({ kind: "error", message })}
      />

      <ConfirmDialog
        open={voidTarget != null}
        title="Void sale"
        message={
          voidTarget
            ? `Remove this sale for lot ${voidTarget.displayLotNumber} and mark the lot unsold? The lot will be available to clerk again.`
            : ""
        }
        confirmLabel="Void sale"
        danger
        onClose={() => setVoidTarget(null)}
        onConfirm={() => void handleVoid()}
      />
    </div>
  );
}

function FragmentRow({
  row,
  sym,
  expanded,
  onToggle,
  onEdit,
  onVoid,
  consignorNameById,
}: {
  row: LotRow;
  sym: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (s: Sale) => void;
  onVoid: (s: Sale) => void;
  consignorNameById: Map<number, string>;
}) {
  const { lot, sale, buyer, consignorLabel } = row;
  const consignorDetail =
    lot.consignorId != null
      ? consignorNameById.get(lot.consignorId) ?? consignorLabel
      : consignorLabel;
  return (
    <>
      <tr
        className="cursor-pointer hover:bg-surface/80 dark:hover:bg-slate-800/60"
        onClick={onToggle}
      >
        <td className="w-8 px-2 py-2 align-top text-muted">
          {expanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )}
        </td>
        <td className="px-3 py-2 font-mono">{lot.displayLotNumber}</td>
        <td className="max-w-[280px] truncate px-3 py-2">{lot.description}</td>
        <td className="px-3 py-2 text-right font-mono">{lot.quantity}</td>
        <td className="px-3 py-2">
          <Badge tone={statusTone(lot.status)}>{lot.status}</Badge>
        </td>
        <td className="px-3 py-2 text-right font-mono">
          {sale?.paddleNumber ?? <span className="text-muted">—</span>}
        </td>
        <td className="px-3 py-2 text-right font-mono">
          {sale?.amount != null ? (
            formatCurrency(sale.amount, sym)
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="max-w-[200px] truncate px-3 py-2 text-muted">
          {consignorLabel || "—"}
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-surface/40 dark:bg-slate-900/40">
          <td className="w-8 px-2 py-3"></td>
          <td colSpan={7} className="px-3 py-3">
            <div className="grid gap-3 text-xs sm:grid-cols-2 md:grid-cols-3">
              <DetailItem label="Lot #" value={lot.displayLotNumber} mono />
              <DetailItem label="Status" value={lot.status} />
              <DetailItem label="Quantity" value={String(lot.quantity)} mono />
              <DetailItem label="Description" value={lot.description} wide />
              <DetailItem
                label="Consignor"
                value={consignorDetail || "—"}
              />
              {lot.notes ? (
                <DetailItem label="Notes" value={lot.notes} wide />
              ) : null}
              {sale ? (
                <>
                  <DetailItem
                    label="Buyer"
                    value={
                      buyer
                        ? `${buyer.firstName} ${buyer.lastName}`
                        : "(unregistered)"
                    }
                  />
                  <DetailItem
                    label="Paddle"
                    value={String(sale.paddleNumber)}
                    mono
                  />
                  <DetailItem
                    label="Hammer (line)"
                    value={formatCurrency(sale.amount, sym)}
                    mono
                  />
                  {saleLineQuantity(sale) > 1 ? (
                    <DetailItem
                      label="Hammer (per unit)"
                      value={formatCurrency(saleUnitHammer(sale), sym)}
                      mono
                    />
                  ) : null}
                  <DetailItem
                    label="Clerk"
                    value={sale.clerkInitials || "—"}
                    mono
                  />
                  <DetailItem
                    label="Recorded"
                    value={formatDateTime(sale.createdAt)}
                  />
                  <DetailItem
                    label="On invoice"
                    value={
                      sale.invoiceId != null ? "Yes" : "Not yet allocated"
                    }
                  />
                </>
              ) : (
                <DetailItem
                  label="Sale"
                  value="No sale recorded for this lot yet."
                />
              )}
            </div>
            {sale ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="inline-flex items-center gap-1"
                  onClick={() => onEdit(sale)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit sale
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="inline-flex items-center gap-1"
                  onClick={() => onVoid(sale)}
                >
                  <Ban className="h-4 w-4" aria-hidden />
                  Void sale
                </Button>
                {sale.invoiceId != null ? (
                  <p className="self-center text-xs text-muted">
                    If this sale is on a paid invoice, mark it unpaid first to
                    edit or void.
                  </p>
                ) : null}
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2 md:col-span-3" : undefined}>
      <dt className="text-[10px] uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-ink dark:text-slate-200 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
