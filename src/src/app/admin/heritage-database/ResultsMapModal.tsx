"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const MASTER_IMG_BUCKET = "master_site_images";

type Point = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  province: string;
  priority: "A" | "B" | "C";
  completed: boolean;
  photographed?: boolean; // used for pin color rule
};

export default function ResultsMapModal({
  onClose,
  points,
}: {
  onClose: () => void;
  points: Point[];
}) {
  const [ready, setReady] = useState<boolean>(!!(globalThis as any)?.google?.maps);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const gmap = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const [imagesMap, setImagesMap] = useState<Record<string, string>>({});

  // Fetch attached photo for each site (latest only)
  useEffect(() => {
    async function fetchImages() {
      if (!points.length) return;

      const ids = points.map((p) => p.id);

      const { data } = await supabase
        .schema("admin_core")
        .from("master_site_images")
        .select("master_site_id, path")
        .in("master_site_id", ids);

      const map: Record<string, string> = {};
      data?.forEach((row) => {
        const { data: pub } = supabase.storage
          .from(MASTER_IMG_BUCKET)
          .getPublicUrl(row.path);
        map[row.master_site_id] = pub.publicUrl;
      });

      setImagesMap(map);
    }

    fetchImages();
  }, [points]);

  // Load Google Maps script
  useEffect(() => {
    if ((globalThis as any)?.google?.maps) {
      setReady(true);
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    const existing = document.getElementById("gmaps-results-script");
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      return;
    }
    const s = document.createElement("script");
    s.id = "gmaps-results-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    s.async = true;
    s.defer = true;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);

  const center = useMemo(() => {
    if (points.length) {
      const [p0] = points;
      return { lat: p0.lat, lng: p0.lng };
    }
    return { lat: 30.3753, lng: 69.3451 }; // Pakistan
  }, [points]);

  // Helper: colored SVG pin as data URL
  function pinUrl(color: string) {
    const svg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <g fill="none" fill-rule="evenodd">
          <path d="M32 2C18.745 2 8 12.745 8 26c0 16.5 19.4 33 23.2 35.9a2.5 2.5 0 0 0 3.6 0C36.6 59 56 42.5 56 26 56 12.745 45.255 2 32 2z" fill="${color}" stroke="#111827" stroke-width="1.5"/>
          <circle cx="32" cy="26" r="8" fill="#fff" fill-opacity=".9"/>
        </g>
      </svg>`
    );
    return `data:image/svg+xml;charset=utf-8,${svg}`;
  }

  // Return color for point by rules
  function colorForPoint(pt: Point) {
    // Completed -> green; Photographed & not completed -> yellow; else red
    if (pt.completed) return "#16a34a"; // emerald-600
    if (pt.photographed && !pt.completed) return "#f59e0b"; // amber-500
    return "#ef4444"; // red-500
  }

  // Build map + markers
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (globalThis as any).google;

    const map = new g.maps.Map(mapRef.current, {
      center,
      zoom: points.length ? 6 : 5,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeControl: true,
      gestureHandling: "greedy",
    });
    gmap.current = map;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new g.maps.LatLngBounds();
    const info = new g.maps.InfoWindow();

    points.forEach((pt) => {
      const iconUrl = pinUrl(colorForPoint(pt));
      const marker = new g.maps.Marker({
        position: { lat: pt.lat, lng: pt.lng },
        map,
        title: pt.name,
        icon: {
          url: iconUrl,
          scaledSize: new g.maps.Size(28, 28),
          anchor: new g.maps.Point(14, 28),
        },
      });

      const imgUrl = imagesMap[pt.id];

      const html = `
        <div style="max-width:200px;">
          ${imgUrl ? `
            <img src="${imgUrl}"
                 style="width:100%;height:110px;object-fit:cover;border-radius:6px;margin-bottom:6px" />
          ` : ""}
          <div style="font-weight:600;color:#111827;margin-bottom:4px">
            ${escapeHtml(pt.name)}
          </div>
          <div style="font-size:12px;color:#374151;margin-bottom:4px">
            ${escapeHtml(pt.province)} • Priority ${pt.priority}
            ${pt.completed ? " • Completed" : ""}
            ${pt.photographed && !pt.completed ? " • Photographed" : ""}
          </div>
        </div>
      `;

      marker.addListener("click", () => {
        info.setContent(html);
        info.open({ map, anchor: marker });
      });

      markersRef.current.push(marker);
      bounds.extend(marker.getPosition() as any);
    });

    if (points.length > 1) {
      map.fitBounds(bounds, 50);
    }

    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      gmap.current = null;
    };
  }, [ready, points, center, imagesMap]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-6xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-h-[92vh] flex flex-col">
        <div className="px-4 sm:px-6 py-3 border-b bg-white sticky top-0 z-10 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            Map: {points.length} result{points.length === 1 ? "" : "s"}
          </h3>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900">✕</button>
        </div>

        <div className="p-3 sm:p-4">
          {ready ? (
            <div ref={mapRef} className="h-[70vh] w-full rounded-lg border border-slate-200" />
          ) : (
            <div className="h-[70vh] w-full rounded-lg border border-slate-200 grid place-items-center text-sm text-slate-600">
              {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                ? "Loading map…"
                : "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map"}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Pins show result locations. Click for details.
          </p>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
