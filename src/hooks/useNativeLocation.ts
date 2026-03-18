"use client";

import { useState, useCallback } from "react";

export type LocationStatus = "idle" | "loading" | "granted" | "denied";

export interface LocationCoords {
  lat: number;
  lng: number;
}

/**
 * Cross-platform location hook.
 * On Capacitor (iOS/Android) it uses @capacitor/geolocation which
 * triggers the native permission dialog.
 * On web it falls back to the browser Geolocation API.
 */
export function useNativeLocation() {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [coords, setCoords] = useState<LocationCoords | null>(null);

  const requestLocation = useCallback(async (): Promise<LocationCoords | null> => {
    setStatus("loading");

    try {
      // Detect Capacitor native environment
      const isNative =
        typeof window !== "undefined" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !!(window as any).Capacitor?.isNativePlatform?.();

      if (isNative) {
        // Dynamically import so the server bundle is not affected
        const { Geolocation } = await import("@capacitor/geolocation");

        // Request permission first (required on iOS)
        const perm = await Geolocation.requestPermissions();
        if (
          perm.location !== "granted" &&
          perm.coarseLocation !== "granted"
        ) {
          setStatus("denied");
          return null;
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });

        const result: LocationCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCoords(result);
        setStatus("granted");
        return result;
      } else {
        // Browser fallback
        if (!navigator.geolocation) {
          setStatus("denied");
          return null;
        }

        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
            })
        );

        const result: LocationCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCoords(result);
        setStatus("granted");
        return result;
      }
    } catch {
      setStatus("denied");
      return null;
    }
  }, []);

  return { status, coords, requestLocation };
}
