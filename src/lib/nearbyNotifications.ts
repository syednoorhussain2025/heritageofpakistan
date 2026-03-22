/**
 * Nearby heritage site notifications.
 *
 * Called on app open and every time the app comes to foreground.
 * Checks location → queries nearby sites → fires a local notification
 * for any site not already notified in the last 24 hours.
 */

import { fetchSitesWithinRadius } from "@/lib/searchRadius";
import {
  requestNotificationPermission,
  scheduleLocalNotification,
} from "@/lib/localNotifications";

const RADIUS_KM = 10;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours per site
const STORAGE_KEY = "nearby_notified"; // stored in @capacitor/preferences

// ── Preferences helpers (Capacitor on native, localStorage on web) ──────────

async function getNotified(): Promise<Record<string, number>> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    return value ? JSON.parse(value) : {};
  } catch {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}

async function saveNotified(map: Record<string, number>): Promise<void> {
  // Prune entries older than cooldown to prevent unbounded growth
  const now = Date.now();
  const pruned = Object.fromEntries(
    Object.entries(map).filter(([, ts]) => now - ts < COOLDOWN_MS)
  );
  const json = JSON.stringify(pruned);
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: STORAGE_KEY, value: json });
  } catch {
    try { localStorage.setItem(STORAGE_KEY, json); } catch { /* ignore */ }
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function checkAndNotifyNearbySites(): Promise<void> {
  // Only run inside Capacitor native
  const isNative =
    typeof window !== "undefined" &&
    !!(window as any).Capacitor?.isNativePlatform?.();
  if (!isNative) return;

  try {
    // 1. Check/request notification permission
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    // 2. Get current location (requires permission already granted — no prompt)
    const { Geolocation } = await import("@capacitor/geolocation");
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") return;

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false, // battery-friendly for background check
      timeout: 8000,
    });
    const { latitude: lat, longitude: lng } = pos.coords;

    // 3. Query nearby sites
    const sites = await fetchSitesWithinRadius(lat, lng, RADIUS_KM);
    if (!sites.length) return;

    // 4. Filter out recently notified
    const notified = await getNotified();
    const now = Date.now();
    const fresh = sites.filter(
      (s) => !notified[s.id] || now - notified[s.id] > COOLDOWN_MS
    );
    if (!fresh.length) return;

    // 5. Fire one notification per fresh site (max 3 at a time to avoid spam)
    const toNotify = fresh.slice(0, 3);
    for (const site of toNotify) {
      const distText =
        site.distance_km < 1
          ? `${Math.round(site.distance_km * 1000)}m away`
          : `${site.distance_km.toFixed(1)}km away`;

      await scheduleLocalNotification({
        // Use a numeric hash of the site id as notification id
        id: Math.abs(site.id.split("").reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0)) % 100000,
        title: site.title,
        body: `Heritage site nearby — ${distText}. Tap to explore.`,
        scheduleAt: new Date(Date.now() + 1000), // 1 second from now
      });

      notified[site.id] = now;
    }

    await saveNotified(notified);
  } catch {
    // Silently ignore — notifications are best-effort
  }
}
