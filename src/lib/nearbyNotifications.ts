/**
 * Nearby heritage site notifications.
 *
 * On app open:
 *   1. Get location → query sites within 20km → store results offline
 *   2. Cancel any previously scheduled notifications (stale data)
 *   3. Schedule a series of re-engagement notifications using the stored sites:
 *      - 30 min after closing: "X heritage sites near you"
 *      - 1 hr:  name a specific site
 *      - 3 hrs: name another specific site
 *      - 6 hrs: summary nudge
 *
 * On app foreground resume:
 *   - Cancel pending scheduled notifications (user is back, no need to nudge)
 *   - Re-run the full check with fresh location + fresh schedule
 */

import { fetchSitesWithinRadius } from "@/lib/searchRadius";
import {
  requestNotificationPermission,
  scheduleLocalNotification,
  cancelAllPendingNotifications,
} from "@/lib/localNotifications";

const RADIUS_KM = 20;
const SITES_CACHE_KEY = "nearby_sites_cache";
const LAST_CHECK_KEY = "nearby_last_check";
const RECHECK_COOLDOWN_MS = 30 * 60 * 1000; // don't re-fetch location more than once per 30min

// Notification IDs — fixed so we can reliably cancel/replace them
const NOTIF_IDS = {
  summary30min: 9001,
  site1hr: 9002,
  site3hr: 9003,
  summary6hr: 9004,
};

// ── Preferences helpers ──────────────────────────────────────────────────────

type CachedSite = { id: string; title: string; distance_km: number };

async function prefsGet(key: string): Promise<string | null> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    try { return localStorage.getItem(key); } catch { return null; }
  }
}

async function prefsSet(key: string, value: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
  } catch {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }
}

// ── Schedule notifications using cached site data ────────────────────────────

async function scheduleReEngagementNotifications(sites: CachedSite[]): Promise<void> {
  if (!sites.length) return;

  const now = Date.now();
  const count = sites.length;

  // Pick two distinct sites to name individually (closest first)
  const [first, second] = sites;

  const nearbyExtra = { type: "nearby" };

  // 30 min — summary
  await scheduleLocalNotification({
    id: NOTIF_IDS.summary30min,
    title: "Heritage Sites Near You",
    body: `${count} heritage site${count > 1 ? "s are" : " is"} within 20km of you. Tap to explore.`,
    scheduleAt: new Date(now + 30 * 60 * 1000),
    extra: nearbyExtra,
  });

  // 1 hr — name the closest site
  if (first) {
    const dist = first.distance_km < 1
      ? `${Math.round(first.distance_km * 1000)}m away`
      : `${first.distance_km.toFixed(1)}km away`;
    await scheduleLocalNotification({
      id: NOTIF_IDS.site1hr,
      title: first.title,
      body: `Only ${dist}. Discover its history on Heritage of Pakistan.`,
      scheduleAt: new Date(now + 60 * 60 * 1000),
      extra: nearbyExtra,
    });
  }

  // 3 hrs — name the second site (or repeat first if only one)
  const siteFor3hr = second ?? first;
  if (siteFor3hr) {
    await scheduleLocalNotification({
      id: NOTIF_IDS.site3hr,
      title: siteFor3hr.title,
      body: `Still nearby — explore ${siteFor3hr.title} and ${count - 1} more heritage sites around you.`,
      scheduleAt: new Date(now + 3 * 60 * 60 * 1000),
      extra: nearbyExtra,
    });
  }

  // 6 hrs — general nudge
  await scheduleLocalNotification({
    id: NOTIF_IDS.summary6hr,
    title: "Explore Pakistan's Heritage",
    body: `You have ${count} heritage site${count > 1 ? "s" : ""} within reach. Don't miss them.`,
    scheduleAt: new Date(now + 6 * 60 * 60 * 1000),
    extra: nearbyExtra,
  });
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function checkAndNotifyNearbySites(): Promise<void> {
  const isNative =
    typeof window !== "undefined" &&
    !!(window as any).Capacitor?.isNativePlatform?.();
  if (!isNative) return;

  try {
    // 1. Check permissions — never prompt, just check
    const hasNotifPermission = await requestNotificationPermission();
    if (!hasNotifPermission) return;

    const { Geolocation } = await import("@capacitor/geolocation");
    const locPerm = await Geolocation.checkPermissions();
    if (locPerm.location !== "granted" && locPerm.coarseLocation !== "granted") return;

    // 2. Cancel any previously scheduled re-engagement notifications
    //    (user opened the app — they're active, no need to nudge them)
    await cancelAllPendingNotifications();

    // 3. Throttle location fetch — reuse cached sites if checked recently
    const lastCheck = Number(await prefsGet(LAST_CHECK_KEY) ?? "0");
    const now = Date.now();
    let sites: CachedSite[];

    if (now - lastCheck < RECHECK_COOLDOWN_MS) {
      // Use cached sites from last check
      const cached = await prefsGet(SITES_CACHE_KEY);
      sites = cached ? JSON.parse(cached) : [];
    } else {
      // Fresh location + fresh query
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 8000,
      });
      const { latitude: lat, longitude: lng } = pos.coords;
      const raw = await fetchSitesWithinRadius(lat, lng, RADIUS_KM);
      sites = raw.map((s) => ({ id: s.id, title: s.title, distance_km: s.distance_km }));

      // Store for later use when app is backgrounded
      await prefsSet(SITES_CACHE_KEY, JSON.stringify(sites));
      await prefsSet(LAST_CHECK_KEY, String(now));
    }

    if (!sites.length) return;

    // 4. Schedule re-engagement notifications to fire after user closes app
    await scheduleReEngagementNotifications(sites);
  } catch {
    // Best-effort — silent failure
  }
}
