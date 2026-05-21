"use client";

import { useState, useEffect, useRef } from "react";
import type { Invoice } from "@/lib/db";
import { mutateWithEventTables } from "@/lib/db/mutateWithParentEventTouch";
import { useUserDb } from "@/components/providers/UserDbProvider";
import { useCloudSync } from "@/components/providers/CloudSyncProvider";
import { enqueueInvoicePatch } from "@/lib/sync/ops/enqueueOps";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PAYMENT_METHODS } from "@/lib/utils/constants";

export function PaymentModal({
  open,
  invoice,
  onClose,
  onPaid,
}: {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  onPaid: (invoice: Invoice) => void;
}) {
  const { db } = useUserDb();
  const { scheduleCloudPush } = useCloudSync();
  const [method, setMethod] = useState<string>("cash");
  const [confirming, setConfirming] = useState(false);
  const confirmingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setMethod("cash");
      setConfirming(false);
      confirmingRef.current = false;
    }
  }, [open, invoice?.id]);

  async function confirm() {
    if (confirmingRef.current) return;
    if (invoice?.id == null || !db) return;
    confirmingRef.current = true;
    setConfirming(true);
    try {
      const now = new Date();
      const pm = method as "cash" | "check" | "credit_card" | "other";
      await mutateWithEventTables(
        db,
        invoice.eventId,
        [db.invoices],
        async () => {
          await db.invoices.update(invoice.id, {
            status: "paid",
            paymentMethod: pm,
            paymentDate: now,
            // Bump generatedAt so this paid edit wins last-write-wins
            // against a teammate's later recalc that left it unpaid.
            generatedAt: now,
          });
        }
      );
      const inv = await db.invoices.get(invoice.id);
      const ev = inv ? await db.events.get(inv.eventId) : null;
      if (inv?.id != null && ev?.syncId) {
        await enqueueInvoicePatch(db, ev.syncId, inv.id, {
          status: "paid",
          paymentMethod: pm,
          paymentDate: now,
          generatedAt: now,
        });
      }
      scheduleCloudPush();
      onPaid(invoice);
      onClose();
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Mark as paid"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={confirming}
          >
            {confirming ? "Saving…" : "Confirm payment"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Record payment for invoice{" "}
        <span className="font-mono font-medium text-ink">
          {invoice?.invoiceNumber}
        </span>
        .
      </p>
      <div>
        <label
          htmlFor="pay-method"
          className="mb-1 block text-sm font-medium text-ink"
        >
          Payment method
        </label>
        <select
          id="pay-method"
          className="w-full rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {PAYMENT_METHODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
