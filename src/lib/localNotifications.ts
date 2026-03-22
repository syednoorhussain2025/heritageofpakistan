// Local notifications via @capacitor/local-notifications
// Only works on Capacitor native — silently no-ops on web

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.requestPermissions();
    return result.display === "granted";
  } catch {
    return false;
  }
}

export async function scheduleLocalNotification({
  id,
  title,
  body,
  scheduleAt,
}: {
  id: number;
  title: string;
  body: string;
  scheduleAt: Date;
}): Promise<void> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          schedule: { at: scheduleAt },
          sound: undefined,
          actionTypeId: "",
          extra: null,
        },
      ],
    });
  } catch {
    // Not in Capacitor or permission denied — silently ignore
  }
}

export async function cancelLocalNotification(id: number): Promise<void> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    // ignore
  }
}
