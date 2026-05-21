"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { SaleForm } from "@/components/clerking/SaleForm";
import { SaleFormFieldOrderEditor } from "@/components/clerking/SaleFormFieldOrderEditor";
import { RecentSales } from "@/components/clerking/RecentSales";
import { LotLookup } from "@/components/clerking/LotLookup";
import { BidderQuickLookup } from "@/components/clerking/BidderQuickLookup";
import { PaddleTally } from "@/components/clerking/PaddleTally";
import { useCurrentEvent } from "@/lib/hooks/useCurrentEvent";
import { useToast } from "@/components/providers/ToastProvider";
import { useCloudSync } from "@/components/providers/CloudSyncProvider";

const linkSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-navy/15 bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-navy/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:focus-visible:ring-offset-slate-950";

export default function ClerkingPage() {
  const { currentEvent, currentEventId } = useCurrentEvent();
  const { showToast } = useToast();
  const { scheduleCloudPush } = useCloudSync();
  const sym = currentEvent?.currencySymbol ?? "$";

  if (currentEventId == null || !currentEvent) {
    return (
      <div>
        <Header
          title="Clerking"
          description="Select an event before clerking."
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

  return (
    <div>
      <Header
        title="Clerking"
        description={`Record sales for ${currentEvent.name}. Tab: lot → price → paddle → qty → description → notes → consignor → initials. Use Record sale or Enter to submit; Shift+Enter pass-out; Esc clears.`}
      />

      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-navy dark:text-slate-100">
              Sale entry
            </h2>
            <SaleForm
              eventId={currentEventId}
              currencySymbol={sym}
              buyersPremiumRate={currentEvent.buyersPremiumRate ?? 0}
            />
            <SaleFormFieldOrderEditor />
          </Card>
          <div className="mt-6">
            <Card>
              <h2 className="mb-4 text-lg font-semibold text-navy dark:text-slate-100">
                Recent sales
              </h2>
              <RecentSales
                event={currentEvent}
                currencySymbol={sym}
                onVoided={() => scheduleCloudPush()}
                onSuccess={(message) =>
                  showToast({ kind: "success", message })
                }
                onError={(message) => showToast({ kind: "error", message })}
              />
            </Card>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <BidderQuickLookup eventId={currentEventId} />
          </Card>
          <Card>
            <PaddleTally event={currentEvent} />
          </Card>
          <div>
            <LotLookup eventId={currentEventId} />
          </div>
        </div>
      </div>
    </div>
  );
}
