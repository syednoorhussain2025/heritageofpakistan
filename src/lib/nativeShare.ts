// Native share — uses @capacitor/share on iOS/Android, falls back to Web Share API, then clipboard

export async function nativeShare(title: string, url: string): Promise<"shared" | "copied" | "cancelled"> {
  try {
    const { Share } = await import("@capacitor/share");
    const canShare = await Share.canShare();
    if (canShare.value) {
      await Share.share({ title, url, dialogTitle: title });
      return "shared";
    }
  } catch {
    // Not in Capacitor or share dismissed — fall through
  }

  // Web Share API fallback (Chrome Android, Safari)
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share({ title, url });
      return "shared";
    } catch {
      // User cancelled
      return "cancelled";
    }
  }

  // Last resort: clipboard
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "cancelled";
  }
}
