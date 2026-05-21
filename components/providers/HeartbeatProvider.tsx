"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSession } from "next-auth/react";

/**
 * Pings the heartbeat endpoint while the tab is signed in and visible.
 * Runs once on mount, then on a 60s interval. Network failures are silently
 * ignored — the admin dashboard treats missing heartbeats as "offline".
 *
 * Backed by `/api/admin/heartbeat` which writes `user_activity_summary` and
 * `user_activity_pings`. We deliberately use heartbeats (not Ably presence)
 * because:
 * - They double as the 24h history record.
 * - They tolerate the existing Ably token issued without a clientId.
 * - They survive network blips via the next ping.
 */
const PING_INTERVAL_MS = 60_000;

export function HeartbeatProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const sentOnceRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") {
      sentOnceRef.current = false;
      return;
    }
    let cancelled = false;
    const ping = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        await fetch("/api/admin/heartbeat/", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        // Ignore — next interval retries.
      }
    };
    if (!sentOnceRef.current) {
      sentOnceRef.current = true;
      void ping();
    }
    const id = window.setInterval(() => void ping(), PING_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) void ping();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status]);

  return <>{children}</>;
}
