/**
 * Thin wrapper around @capacitor/keyboard.
 * Fire-and-forget, never throws — safe to call on web too.
 */

function isNative(): boolean {
  return (
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!(window as any).Capacitor?.isNativePlatform?.()
  );
}

/** Hide the native keyboard — reliable on iOS/Android via Capacitor */
export async function hideKeyboard(): Promise<void> {
  // Always blur the active element first (works on web + native)
  (document.activeElement as HTMLElement)?.blur();
  if (!isNative()) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.hide();
  } catch { /* no-op */ }
}

/** Hide the iOS "Done" accessory bar above the keyboard — call once on app init */
export async function initKeyboard(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch { /* no-op */ }
}
