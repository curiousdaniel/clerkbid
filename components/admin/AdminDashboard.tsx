"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AdminUserRow } from "@/lib/admin/userStats";
import { formatDateTime } from "@/lib/utils/formatDate";
import { isSuperAdminUserIdAndEmail } from "@/lib/auth/superAdmin";
import { Badge } from "@/components/ui/Badge";

function formatRelative(date: Date | null): string {
  if (!date) return "never";
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 60 * 60_000) {
    const m = Math.round(ms / 60_000);
    return `${m} min ago`;
  }
  if (ms < 24 * 60 * 60_000) {
    const h = Math.round(ms / (60 * 60_000));
    return `${h} hr ago`;
  }
  return formatDateTime(date);
}

function formatMoney(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AdminDashboard({
  initialUsers,
  loadError,
}: {
  initialUsers: AdminUserRow[];
  loadError: string | null;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceSeverity, setAnnounceSeverity] = useState<
    "info" | "warning"
  >("info");
  const [announceSending, setAnnounceSending] = useState(false);
  const [announceError, setAnnounceError] = useState<string | null>(null);
  const [announceOk, setAnnounceOk] = useState<string | null>(null);
  const [announceDelivery, setAnnounceDelivery] = useState<
    "online_now" | "persist_cross_session"
  >("online_now");
  const [announceSaveToCenter, setAnnounceSaveToCenter] = useState(true);

  const showAdmin =
    status === "authenticated" &&
    session?.user &&
    isSuperAdminUserIdAndEmail(session.user.id, session.user.email) &&
    !session.impersonatedByUserId;

  async function signInAs(targetUserId: number) {
    setPendingId(targetUserId);
    try {
      const res = await fetch("/api/admin/impersonate/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const data = (await res.json()) as {
        impersonationToken?: string;
        error?: string;
      };
      if (!res.ok || !data.impersonationToken) {
        window.alert(data.error ?? "Could not start impersonation.");
        return;
      }
      await signIn("admin-impersonate", {
        impersonationToken: data.impersonationToken,
        redirect: true,
        callbackUrl: "/dashboard/",
      });
    } catch {
      window.alert("Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  /** Defer after click so the browser can paint before confirm/fetch (INP). */
  function requestDeleteUser(target: AdminUserRow) {
    window.setTimeout(() => {
      void runDeleteUser(target);
    }, 0);
  }

  async function runDeleteUser(target: AdminUserRow) {
    const ok = window.confirm(
      `Permanently delete user ${target.email} (ID ${target.id})?\n\n` +
        `This cannot be undone. If they are the last member of “${target.vendor_name}”, the organization and its cloud backups will be removed.`
    );
    if (!ok) return;

    setDeletingId(target.id);
    try {
      const res = await fetch("/api/admin/delete-user/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        window.setTimeout(() => {
          window.alert(data.error ?? "Could not delete user.");
        }, 0);
        return;
      }
      // Await refresh so RSC picks up the new user list (startTransition deferred
      // updates and left stale initialUsers until a full reload).
      await router.refresh();
    } catch {
      window.setTimeout(() => {
        window.alert("Something went wrong.");
      }, 0);
    } finally {
      setDeletingId(null);
    }
  }

  async function sendAnnouncement(e: FormEvent) {
    e.preventDefault();
    setAnnounceError(null);
    setAnnounceOk(null);
    const body = announceBody.trim();
    if (!body) {
      setAnnounceError("Message is required.");
      return;
    }
    setAnnounceSending(true);
    try {
      const res = await fetch("/api/admin/ably-announce/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: announceTitle.trim() || undefined,
          body,
          severity: announceSeverity,
          deliveryAudience: announceDelivery,
          recordInMessageCenter: announceSaveToCenter,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        id?: string;
        ablyPublished?: boolean;
      };
      if (!res.ok) {
        setAnnounceError(data.error ?? "Request failed.");
        return;
      }
      const ablyNote =
        data.ablyPublished === false ? " (saved; Ably not configured)" : "";
      setAnnounceOk(`Sent (id ${data.id ?? "?"})${ablyNote}`);
      setAnnounceBody("");
      setAnnounceTitle("");
    } catch {
      setAnnounceError("Something went wrong.");
    } finally {
      setAnnounceSending(false);
    }
  }

  if (status === "loading") {
    return (
      <div>
        <Header title="Admin" description="Loading…" />
        <p className="mt-4 text-sm text-muted">Loading session…</p>
      </div>
    );
  }

  if (!showAdmin) {
    return (
      <div>
        <Header title="Admin" description="Restricted." />
        <p className="mt-4 text-sm text-muted">You do not have access.</p>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Admin"
        description="User accounts and cloud-sync statistics. Counts reflect server backups only, not unsynced local data."
      />

      {loadError ? (
        <Card className="mt-6 border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100">
          {loadError}
        </Card>
      ) : null}

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold text-ink dark:text-slate-100">
          Global in-app announcement
        </h2>
        <p className="mt-1 text-xs text-muted">
          Online users get a toast via Ably (
          <code className="rounded bg-surface-muted px-1 font-mono text-[11px]">
            clerkbid:announce
          </code>
          ) when{" "}
          <code className="rounded bg-surface-muted px-1 font-mono text-[11px]">
            ABLY_API_KEY
          </code>{" "}
          and{" "}
          <code className="rounded bg-surface-muted px-1 font-mono text-[11px]">
            NEXT_PUBLIC_ABLY_SYNC=1
          </code>{" "}
          are set. Cross-session delivery stores the message so users who sign in
          later still get a toast. Run{" "}
          <code className="rounded bg-surface-muted px-1 font-mono text-[11px]">
            db/migrate_global_announcements.sql
          </code>{" "}
          on your database for storage and the Message center.
        </p>
        <form className="mt-4 space-y-3" onSubmit={(ev) => void sendAnnouncement(ev)}>
          <Input
            id="announce-title"
            label="Title (optional)"
            value={announceTitle}
            onChange={(ev) => setAnnounceTitle(ev.target.value)}
            maxLength={120}
            placeholder="e.g. Scheduled maintenance"
            disabled={announceSending}
          />
          <div className="w-full">
            <label
              htmlFor="announce-body"
              className="mb-1 block text-sm font-medium text-ink dark:text-slate-200"
            >
              Message
            </label>
            <textarea
              id="announce-body"
              value={announceBody}
              onChange={(ev) => setAnnounceBody(ev.target.value)}
              maxLength={2000}
              rows={4}
              disabled={announceSending}
              placeholder="Shown as an in-app toast for all signed-in users."
              className="w-full rounded-lg border border-navy/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink dark:text-slate-200">
              Who receives it
            </legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-ink dark:text-slate-200">
              <input
                type="radio"
                name="announce-delivery"
                className="mt-1"
                checked={announceDelivery === "online_now"}
                disabled={announceSending}
                onChange={() => setAnnounceDelivery("online_now")}
              />
              <span>
                <span className="font-medium">Online now</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Toast for users signed in at send time (Ably). Optional log in
                  Message center if checked below.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-ink dark:text-slate-200">
              <input
                type="radio"
                name="announce-delivery"
                className="mt-1"
                checked={announceDelivery === "persist_cross_session"}
                disabled={announceSending}
                onChange={() => setAnnounceDelivery("persist_cross_session")}
              />
              <span>
                <span className="font-medium">Everyone when they sign in</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Stored on the server; each user gets a toast once after login,
                  including people not online when you send. Also pushed on Ably
                  for users already online.
                </span>
              </span>
            </label>
          </fieldset>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-ink dark:text-slate-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={announceSaveToCenter}
              disabled={announceSending}
              onChange={(ev) => setAnnounceSaveToCenter(ev.target.checked)}
            />
            <span>
              <span className="font-medium">Save to Message center</span>
              <span className="mt-0.5 block text-xs text-muted">
                Listed under Message center in the sidebar. Uncheck to skip the
                log for this send (online-only toasts, or cross-session toasts
                that should not appear in the archive).
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink dark:text-slate-200">
              <span className="text-muted">Severity</span>
              <select
                value={announceSeverity}
                onChange={(ev) =>
                  setAnnounceSeverity(
                    ev.target.value === "warning" ? "warning" : "info"
                  )
                }
                disabled={announceSending}
                className="rounded-lg border border-navy/20 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
              </select>
            </label>
            <Button type="submit" disabled={announceSending}>
              {announceSending ? "Sending…" : "Send announcement"}
            </Button>
          </div>
          {announceError ? (
            <p className="text-sm text-danger" role="alert">
              {announceError}
            </p>
          ) : null}
          {announceOk ? (
            <p className="text-sm text-success dark:text-emerald-400">
              {announceOk}
            </p>
          ) : null}
        </form>
      </Card>

      <ActivitySummary users={initialUsers} />

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-navy/10 bg-surface-muted/50 text-xs font-semibold uppercase tracking-wide text-muted dark:border-slate-700 dark:bg-slate-800/40">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3 text-right">Events</th>
              <th className="px-4 py-3 text-right">Lots</th>
              <th className="px-4 py-3 text-right">Bidders</th>
              <th className="px-4 py-3 text-right">Consignors</th>
              <th className="px-4 py-3 text-right">Sales</th>
              <th className="px-4 py-3 text-right">Invoices</th>
              <th className="px-4 py-3 text-right">Invoice total</th>
              <th className="px-4 py-3">Last sync</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/10 dark:divide-slate-700">
            {initialUsers.map((u) => {
              const isSelf =
                Number(session.user.id) === u.id ||
                session.user.email?.toLowerCase() === u.email.toLowerCase();
              return (
                <tr key={u.id} className="bg-white/40 dark:bg-slate-900/20">
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          u.online_now
                            ? "bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900/50"
                            : u.last_seen_at
                              ? "bg-slate-300 dark:bg-slate-600"
                              : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      />
                      <span className="text-xs text-muted">
                        {u.online_now ? "Online" : formatRelative(u.last_seen_at)}
                      </span>
                    </div>
                    {u.pings_24h > 0 ? (
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                        {u.pings_24h} ping{u.pings_24h === 1 ? "" : "s"} / 24h
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-ink dark:text-slate-100">
                      {u.first_name} {u.last_name}
                    </div>
                    <div className="text-xs text-muted">{u.email}</div>
                    <div className="text-xs text-muted">ID {u.id}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-muted">
                    <div className="text-ink dark:text-slate-200">{u.vendor_name}</div>
                    <div className="text-xs">{u.vendor_slug}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.synced_events}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.total_lots}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.total_bidders}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.total_consignors}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.total_sales}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.total_invoices}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(u.invoice_total_sum)}
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-muted">
                    {u.last_cloud_sync
                      ? formatDateTime(u.last_cloud_sync)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {isSelf ? (
                      <span className="text-xs text-muted">You</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={pendingId != null || deletingId != null}
                          onClick={() => void signInAs(u.id)}
                        >
                          {pendingId === u.id ? "Signing in…" : "Sign in as"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            pendingId != null ||
                            deletingId != null ||
                            isSuperAdminUserIdAndEmail(String(u.id), u.email)
                          }
                          className="border-red-200 text-red-800 hover:bg-red-50 dark:border-red-900/50 dark:text-red-200 dark:hover:bg-red-950/40"
                          onClick={() => requestDeleteUser(u)}
                          title={
                            isSuperAdminUserIdAndEmail(String(u.id), u.email)
                              ? "Super-admin accounts cannot be deleted here."
                              : undefined
                          }
                        >
                          {deletingId === u.id ? "Deleting…" : "Delete user"}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {initialUsers.length === 0 && !loadError ? (
          <p className="p-6 text-sm text-muted">No users yet.</p>
        ) : null}
      </Card>

      <p className="mt-6 text-xs text-muted">
        Impersonation and user deletion are audited in your server logs. Use
        only to support customers who expect you to access or manage their
        account.
      </p>
    </div>
  );
}

function ActivitySummary({ users }: { users: AdminUserRow[] }) {
  const onlineNow = users.filter((u) => u.online_now);
  const active24h = users.filter((u) => u.pings_24h > 0);
  const totalEvents = users.reduce((a, u) => a + u.synced_events, 0);
  const totalSales = users.reduce((a, u) => a + Number(u.total_sales || 0), 0);
  const totalInvoiceSum = users.reduce(
    (a, u) => a + Number(u.invoice_total_sum || 0),
    0
  );
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <SummaryCard
        label="Online now"
        value={String(onlineNow.length)}
        sub={
          onlineNow.length > 0
            ? onlineNow
                .slice(0, 3)
                .map((u) => `${u.first_name} ${u.last_name}`)
                .join(", ") + (onlineNow.length > 3 ? "…" : "")
            : "No one is signed in right now."
        }
        accent={onlineNow.length > 0 ? "live" : undefined}
      />
      <SummaryCard
        label="Active in last 24h"
        value={String(active24h.length)}
        sub={`of ${users.length} accounts`}
      />
      <SummaryCard label="Synced events" value={String(totalEvents)} />
      <SummaryCard label="Sales" value={totalSales.toLocaleString()} />
      <SummaryCard
        label="Invoice totals"
        value={`$${totalInvoiceSum.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "live";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        {accent === "live" ? <Badge tone="success">Live</Badge> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink dark:text-slate-100">
        {value}
      </p>
      {sub ? (
        <p className="mt-1 truncate text-xs text-muted">{sub}</p>
      ) : null}
    </Card>
  );
}
