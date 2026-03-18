/**
 * Thin wrapper around @capacitor/haptics.
 * All functions are fire-and-forget and never throw — safe to call on web
 * (where Capacitor is not available) and on native iOS / Android.
 */

function isNative(): boolean {
  return (
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!(window as any).Capacitor?.isNativePlatform?.()
  );
}

/** Light tap — category pills, carousel dots, secondary buttons */
export async function hapticLight(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch { /* no-op */ }
}

/** Medium tap — primary buttons, card taps, sheet action rows */
export async function hapticMedium(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch { /* no-op */ }
}

/** Heavy tap — destructive actions, hard confirms */
export async function hapticHeavy(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch { /* no-op */ }
}

/** Success notification — location granted, site saved/collected */
export async function hapticSuccess(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch { /* no-op */ }
}

/** Warning notification — denied permission, empty results */
export async function hapticWarning(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Warning });
  } catch { /* no-op */ }
}

/** Selection changed — carousel snapped to new slide */
export async function hapticSelection(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.selectionChanged();
  } catch { /* no-op */ }
}
