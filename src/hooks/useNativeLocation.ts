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
 *
 * Also reverse-geocodes the position to a city name using
 * OpenStreetMap Nominatim (free, no API key required).
 */
export function useNativeLocation() {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);

  const requestLocation = useCallback(async (): Promise<LocationCoords | null> => {
    setStatus("loading");

    try {
      // Detect Capacitor native environment
      const isNative =
        typeof window !== "undefined" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !!(window as any).Capacitor?.isNativePlatform?.();

      let result: LocationCoords;

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

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });

        result = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      } else {
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

        result = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      }

      setCoords(result);
      setStatus("granted");

      // Reverse geocode in background — non-blocking
      reverseGeocode(result.lat, result.lng).then(setCityName).catch(() => {});

      return result;
    } catch {
      setStatus("denied");
      return null;
    }
  }, []);

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
