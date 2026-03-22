// Native camera/photo picker — uses @capacitor/camera on iOS/Android, falls back to file input on web

export type PhotoResult = { dataUrl: string; format: string } | null;

export async function pickPhotoFromCamera(): Promise<PhotoResult> {
  try {
    const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.DataUrl,
      quality: 85,
      allowEditing: false,
    });
    if (!photo.dataUrl) return null;
    return { dataUrl: photo.dataUrl, format: photo.format };
  } catch {
    return null;
  }
}

export async function pickPhotoFromGallery(): Promise<PhotoResult> {
  try {
    const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.DataUrl,
      quality: 85,
      allowEditing: false,
    });
    if (!photo.dataUrl) return null;
    return { dataUrl: photo.dataUrl, format: photo.format };
  } catch {
    return null;
  }
}

/** Converts a dataUrl to a File object for upload */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

/** Returns true if running inside Capacitor native app */
export function isCapacitorNative(): boolean {
  return typeof (window as any)?.Capacitor?.isNativePlatform === "function"
    && (window as any).Capacitor.isNativePlatform();
}
