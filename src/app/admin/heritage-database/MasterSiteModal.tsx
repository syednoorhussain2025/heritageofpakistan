"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type MasterSite = {
  id: string;
  name: string;
  slug: string;
  province_id: number;
  latitude: number | null;
  longitude: number | null;
  priority: "A" | "B" | "C";
  unesco_status: "none" | "inscribed" | "tentative";
  visited: boolean;
  photographed: boolean;
  added_to_website: boolean;
  public_site_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Province = { id: number; name: string; slug: string };
type Region = { id: string; name: string };
type Category = { id: string; name: string };
type PublicSite = {
  id: string;
  title: string;
  slug: string;
  province_id: number | null;
};

export default function MasterSiteModal({
  onClose,
  onSaved,
  provinces,
  allRegions,
  allCategories,
  initial,
}: {
  onClose: () => void;
  onSaved: () => void;
  provinces: Province[];
  allRegions: Region[];
  allCategories: Category[];
  initial: MasterSite | null;
}) {
  const [name, setName] = useState<string>(initial?.name || "");
  const [slug, setSlug] = useState<string>(initial?.slug || "");
  const [provinceId, setProvinceId] = useState<number>(
    initial?.province_id || provinces[0]?.id || 1
  );
  const [lat, setLat] = useState<string>(
    initial?.latitude != null ? String(initial.latitude) : ""
  );
  const [lng, setLng] = useState<string>(
    initial?.longitude != null ? String(initial.longitude) : ""
  );
  const [priority, setPriority] = useState<"A" | "B" | "C">(
    initial?.priority || "B"
  );
  const [unesco, setUnesco] = useState<"none" | "inscribed" | "tentative">(
    initial?.unesco_status || "none"
  );
  const [visited, setVisited] = useState<boolean>(initial?.visited || false);
  const [photographed, setPhotographed] = useState<boolean>(
    initial?.photographed || false
  );
  const [added, setAdded] = useState<boolean>(
    initial?.added_to_website || false
  );
  const [publicSite, setPublicSite] = useState<PublicSite | null>(null);
  const [notes, setNotes] = useState<string>(initial?.notes || "");

  const [regionIds, setRegionIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);

  // load existing taxonomy links when editing
  useEffect(() => {
    if (!initial) return;
    (async () => {
      const [{ data: rs }, { data: cs }] = await Promise.all([
        supabase
          .schema("admin_core")
          .from("master_site_regions")
          .select("region_id")
          .eq("master_site_id", initial.id),
        supabase
          .schema("admin_core")
          .from("master_site_categories")
          .select("category_id")
          .eq("master_site_id", initial.id),
      ]);
      setRegionIds((rs || []).map((r: any) => r.region_id));
      setCategoryIds((cs || []).map((c: any) => c.category_id));

      if (initial.public_site_id) {
        const { data: pub } = await supabase
          .from("sites")
          .select("id, title, slug, province_id")
          .eq("id", initial.public_site_id)
          .maybeSingle();
        if (pub) setPublicSite(pub as PublicSite);
      }
    })();
  }, [initial]);

  function slugify(s: string) {
    return s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function save() {
    if (!name.trim()) return alert("Please enter a name.");
    if (!slug.trim()) setSlug(slugify(name));

    setSaving(true);
    try {
      if (!initial) {
        const { data: inserted, error } = await supabase
          .schema("admin_core")
          .from("master_sites")
          .insert({
            name: name.trim(),
            slug: slugify(slug || name),
            province_id: provinceId,
            latitude: lat ? Number(lat) : null,
            longitude: lng ? Number(lng) : null,
            priority,
            unesco_status: unesco,
            visited,
            photographed,
            added_to_website: added,
            public_site_id: added ? publicSite?.id ?? null : null,
            notes: notes || null,
          })
          .select()
          .single();
        if (error) throw error;

        const masterId = (inserted as any).id as string;
        if (regionIds.length) {
          await supabase
            .schema("admin_core")
            .from("master_site_regions")
            .insert(
              regionIds.map((rid) => ({
                master_site_id: masterId,
                region_id: rid,
              }))
            );
        }
        if (categoryIds.length) {
          await supabase
            .schema("admin_core")
            .from("master_site_categories")
            .insert(
              categoryIds.map((cid) => ({
                master_site_id: masterId,
                category_id: cid,
              }))
            );
        }
      } else {
        const { error } = await supabase
          .schema("admin_core")
          .from("master_sites")
          .update({
            name: name.trim(),
            slug: slugify(slug || name),
            province_id: provinceId,
            latitude: lat ? Number(lat) : null,
            longitude: lng ? Number(lng) : null,
            priority,
            unesco_status: unesco,
            visited,
            photographed,
            added_to_website: added,
            public_site_id: added ? publicSite?.id ?? null : null,
            notes: notes || null,
          })
          .eq("id", initial.id);
        if (error) throw error;

        // replace taxonomy joins
        await supabase
          .schema("admin_core")
          .from("master_site_regions")
          .delete()
          .eq("master_site_id", initial.id);
        await supabase
          .schema("admin_core")
          .from("master_site_categories")
          .delete()
          .eq("master_site_id", initial.id);

        if (regionIds.length) {
          await supabase
            .schema("admin_core")
            .from("master_site_regions")
            .insert(
              regionIds.map((rid) => ({
                master_site_id: initial.id,
                region_id: rid,
              }))
            );
        }
        if (categoryIds.length) {
          await supabase
            .schema("admin_core")
            .from("master_site_categories")
            .insert(
              categoryIds.map((cid) => ({
                master_site_id: initial.id,
                category_id: cid,
              }))
            );
        }
      }

      onSaved();
    } catch (e: any) {
      alert(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full sm:max-w-5xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
        {/* sticky header */}
        <div className="px-4 sm:px-6 py-3 border-b bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
              {initial ? "Edit Site" : "Add Site"}
            </h2>
            <button onClick={onClose} className="text-slate-600 hover:text-slate-900">
              ✕
            </button>
          </div>
        </div>

        {/* scrollable body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <div className="font-medium mb-1">Site Name</div>
              <input
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!initial) setSlug(slugify(e.target.value));
                }}
              />
            </label>

            <label className="block">
              <div className="font-medium mb-1">Slug</div>
              <input
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>

            <label className="block">
              <div className="font-medium mb-1">Province</div>
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={provinceId}
                onChange={(e) => setProvinceId(Number(e.target.value))}
              >
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <div className="font-medium mb-1">Latitude</div>
                <input
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                  inputMode="decimal"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="24.8607"
                />
              </label>
              <label className="block">
                <div className="font-medium mb-1">Longitude</div>
                <input
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                  inputMode="decimal"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="67.0011"
                />
              </label>
              <div className="col-span-2">
                <MapPicker
                  lat={lat}
                  lng={lng}
                  onPick={(la, ln) => {
                    setLat(la.toFixed(6));
                    setLng(ln.toFixed(6));
                  }}
                />
              </div>
            </div>

            <label className="block">
              <div className="font-medium mb-1">Priority</div>
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
              >
                <option value="A">Priority A</option>
                <option value="B">Priority B</option>
                <option value="C">Priority C</option>
              </select>
            </label>

            <label className="block">
              <div className="font-medium mb-1">UNESCO Status</div>
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={unesco}
                onChange={(e) => setUnesco(e.target.value as any)}
              >
                <option value="none">None</option>
                <option value="inscribed">World Heritage List</option>
                <option value="tentative">Tentative List</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={visited}
                onChange={(e) => setVisited(e.target.checked)}
              />
              <span>Visited</span>
            </label>

            <label className="inline-flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={photographed}
                onChange={(e) => setPhotographed(e.target.checked)}
              />
              <span>Photographed</span>
            </label>

            <div className="sm:col-span-2">
              <div className="font-medium mb-1">Regions</div>
              <ChipMultiSelect
                items={allRegions}
                selected={regionIds}
                setSelected={setRegionIds}
              />
            </div>

            <div className="sm:col-span-2">
              <div className="font-medium mb-1">Categories</div>
              <ChipMultiSelect
                items={allCategories}
                selected={categoryIds}
                setSelected={setCategoryIds}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={added}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setAdded(next);
                    if (next) setSitePickerOpen(true);
                    else setPublicSite(null);
                  }}
                />
                <span>Added to Website</span>
              </label>
              {added && (
                <div className="mt-2 text-sm text-slate-700">
                  {publicSite ? (
                    <>
                      Linked to public site:{" "}
                      <span className="font-medium">{publicSite.title}</span>{" "}
                      (<span className="text-slate-500">{publicSite.slug}</span>)
                    </>
                  ) : (
                    <button
                      onClick={() => setSitePickerOpen(true)}
                      className="underline"
                      style={{ color: "#0f2746" }}
                    >
                      Choose public site…
                    </button>
                  )}
                </div>
              )}
            </div>

            <label className="sm:col-span-2 block">
              <div className="font-medium mb-1">Notes</div>
              <textarea
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* sticky footer */}
        <div className="px-4 sm:px-6 py-3 border-t bg-white sticky bottom-0 z-10">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-md text-white disabled:opacity-60"
              style={{ backgroundColor: "#0f2746" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {sitePickerOpen && (
        <PublicSitePicker
          provinces={provinces}
          onClose={() => setSitePickerOpen(false)}
          onSelect={(s) => {
            setPublicSite(s);
            setSitePickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Reusable small pieces ---------- */
function ChipMultiSelect<T extends { id: string; name: string }>({
  items,
  selected,
  setSelected,
}: {
  items: T[];
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => it.name.toLowerCase().includes(s));
  }, [q, items]);

  function toggle(id: string) {
    setSelected(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    );
  }

  return (
    <div className="border border-slate-300 rounded-md p-3 bg-white">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2"
      />
      <div className="flex flex-wrap gap-2 mb-2">
        {items
          .filter((i) => selected.includes(i.id))
          .map((it) => (
            <button
              key={it.id}
              className="px-3 py-1 rounded-full text-white text-sm"
              style={{ backgroundColor: "#0f2746" }}
              onClick={() => toggle(it.id)}
              title="Remove"
            >
              {it.name} ×
            </button>
          ))}
      </div>
      <div className="max-h-40 overflow-auto">
        {filtered.map((it) => (
          <label
            key={it.id}
            className="flex items-center gap-2 py-1 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(it.id)}
              onChange={() => toggle(it.id)}
            />
            <span>{it.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PublicSitePicker({
  provinces,
  onClose,
  onSelect,
}: {
  provinces: Province[];
  onClose: () => void;
  onSelect: (s: PublicSite) => void;
}) {
  const [q, setQ] = useState("");
  const [provinceId, setProvinceId] = useState<number | "">("");
  const [rows, setRows] = useState<PublicSite[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("sites")
      .select("id, title, slug, province_id")
      .order("title", { ascending: true })
      .limit(50);
    if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);
    if (provinceId !== "") query = query.eq("province_id", provinceId);
    const { data } = await query;
    setRows((data || []) as PublicSite[]);
    setLoading(false);
  }, [q, provinceId]);

  useEffect(() => {
    search();
  }, [search]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-h-[85vh] flex flex-col">
        <div className="px-4 sm:px-6 py-3 border-b bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              Link public site
            </h3>
            <button onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title…"
              className="border border-slate-300 rounded-md px-3 py-2 sm:col-span-2"
            />
            <select
              value={provinceId}
              onChange={(e) =>
                setProvinceId(e.target.value ? Number(e.target.value) : "")
              }
              className="border border-slate-300 rounded-md px-3 py-2"
            >
              <option value="">All provinces</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Slug</th>
                  <th className="px-3 py-2 text-left">Province</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-4 text-center text-slate-500"
                    >
                      Searching…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-4 text-center text-slate-500"
                    >
                      No results.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2 text-slate-500">{r.slug}</td>
                    <td className="px-3 py-2">
                      {provinces.find((p) => p.id === r.province_id)?.name ||
                        "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
                        onClick={() => onSelect(r)}
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Google Map picker (viewport-safe height) */
function MapPicker({
  lat,
  lng,
  onPick,
}: {
  lat: string;
  lng: string;
  onPick: (la: number, ln: number) => void;
}) {
  const [ready, setReady] = useState<boolean>(
    !!(globalThis as any)?.google?.maps
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if ((globalThis as any)?.google?.maps) {
      setReady(true);
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    const existing = document.getElementById("gmaps-script-lite");
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      return;
    }
    const s = document.createElement("script");
    s.id = "gmaps-script-lite";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);

  const center = useMemo(() => {
    const la = Number(lat);
    const ln = Number(lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) return { lat: la, lng: ln };
    return { lat: 30.3753, lng: 69.3451 }; // Pakistan center
  }, [lat, lng]);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const g = (globalThis as any).google;
    const map = new g.maps.Map(containerRef.current, {
      center,
      zoom: 6,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: true,
      gestureHandling: "greedy",
    });
    const marker = new g.maps.Marker({ position: center, map, draggable: true });

    map.addListener("click", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      marker.setPosition(p);
      onPick(p.lat, p.lng);
    });
    marker.addListener("dragend", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      onPick(p.lat, p.lng);
    });

    // Places search box
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search location…";
    Object.assign(input.style, {
      boxSizing: "border-box",
      border: "1px solid #d1d5db",
      borderRadius: "8px",
      width: "320px",
      height: "38px",
      padding: "0 12px",
      margin: "10px",
      background: "#fff",
      fontSize: "14px",
    } as CSSStyleDeclaration);
    map.controls[g.maps.ControlPosition.TOP_LEFT].push(input);

    let autocomplete: any;
    if (g.maps.places) {
      autocomplete = new g.maps.places.Autocomplete(input, {
        fields: ["geometry", "name", "formatted_address"],
      });
      autocomplete.bindTo("bounds", map);
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const loc = place?.geometry?.location;
        if (!loc) return;
        const p = { lat: loc.lat(), lng: loc.lng() };
        if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
        else {
          map.setCenter(p);
          map.setZoom(12);
        }
        marker.setPosition(p);
        onPick(p.lat, p.lng);
      });
    }

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      marker.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [ready]); // eslint-disable-line

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setPosition(center);
    map.setCenter(center);
  }, [center]);

  if (!ready) {
    return (
      <div className="h-56 w-full border border-slate-300 rounded-md grid place-items-center text-sm text-slate-600 bg-white">
        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          ? "Loading map…"
          : "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable map"}
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      className="h-56 w-full border border-slate-300 rounded-md bg-white"
    />
  );
}
