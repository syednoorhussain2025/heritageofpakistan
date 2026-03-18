"use client";

import { useState, useCallback, useEffect } from "react";

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
 *
 * On mount, silently checks if permission was already granted and
 * auto-reads location — no button press needed on repeat launches.
 *
 * Also reverse-geocodes the position to a city name using
 * OpenStreetMap Nominatim (free, no API key required).
 */
export function useNativeLocation() {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);

  /** Shared logic: get position and set state. Does NOT call requestPermissions. */
  const fetchPosition = useCallback(async (): Promise<LocationCoords | null> => {
    try {
      const isNative =
        typeof window !== "undefined" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !!(window as any).Capacitor?.isNativePlatform?.();

      let result: LocationCoords;

      if (isNative) {
        const { Geolocation } = await import("@capacitor/geolocation");
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });
        result = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      } else {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
            })
        );
        result = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      }

      setCoords(result);
      setStatus("granted");
      reverseGeocode(result.lat, result.lng).then(setCityName).catch(() => {});
      return result;
    } catch {
      return null;
    }
  }, []);

  /** On mount: silently check if permission already granted, auto-fetch if so. */
  useEffect(() => {
    (async () => {
      try {
        const isNative =
          typeof window !== "undefined" &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          !!(window as any).Capacitor?.isNativePlatform?.();

        if (isNative) {
          const { Geolocation } = await import("@capacitor/geolocation");
          const perm = await Geolocation.checkPermissions();
          if (perm.location === "granted" || perm.coarseLocation === "granted") {
            setStatus("loading");
            await fetchPosition();
          }
        } else {
          // Web: navigator.permissions API to check without prompting
          if (navigator?.permissions) {
            const result = await navigator.permissions.query({ name: "geolocation" });
            if (result.state === "granted") {
              setStatus("loading");
              await fetchPosition();
            }
          }
        }
      } catch {
        // Permission check failed silently — user will see Enable button
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** User-initiated: request permission then fetch position. */
  const requestLocation = useCallback(async (): Promise<LocationCoords | null> => {
    setStatus("loading");

    try {
      const isNative =
        typeof window !== "undefined" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !!(window as any).Capacitor?.isNativePlatform?.();

      if (isNative) {
        const { Geolocation } = await import("@capacitor/geolocation");
        const perm = await Geolocation.requestPermissions();
        if (
          perm.location !== "granted" &&
          perm.coarseLocation !== "granted"
        ) {
          setStatus("denied");
          return null;
        }
      } else {
        if (!navigator.geolocation) {
          setStatus("denied");
          return null;
        }
      }

      const result = await fetchPosition();
      if (!result) {
        setStatus("denied");
        return null;
      }
      return result;
    } catch {
      setStatus("denied");
      return null;
    }
  }, [fetchPosition]);

  return { status, coords, cityName, requestLocation };
}

/**
 * Reverse geocode using OpenStreetMap Nominatim.
 * Returns the most specific locality name available:
 * city > town > village > county > state
 */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error("Nominatim error");
  const json = await res.json();
  const a = json.address ?? {};
  return (
    a.city ||
    a.town ||
    a.village ||
    a.suburb ||
    a.county ||
    a.state ||
    "Your Location"
  );
}
