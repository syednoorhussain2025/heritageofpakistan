// src/app/explore/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/* ───────────── Types ───────────── */
type Site = {
  id: string;
  slug: string;
  title: string;
  tagline?: string | null;
  cover_photo_url?: string | null;
  location_free?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  created_at?: string | null;
};

type Option = { id: string; name: string };

/* ───────────── Helpers ───────────── */
const PAGE_SIZE = 12;

function parseMulti(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildQueryString(params: Record<string, any>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v) && v.length === 0) return;
    if (Array.isArray(v)) search.set(k, v.join(","));
    else if (String(v).length) search.set(k, String(v));
  });
  return `?${search.toString()}`;
}

/* ───────────── UI Bits ───────────── */
function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium mb-1">{children}</label>;
}

function Select({
  value,
  onChange,
  children,
  multiple = false,
}: {
  value: string | string[];
  onChange: (value: string | string[]) => void;
  children: React.ReactNode;
  multiple?: boolean;
}) {
  return (
    <select
      multiple={multiple}
      value={value as any}
      onChange={(e) => {
        if (multiple) {
          const arr = Array.from(e.currentTarget.selectedOptions).map(
            (o) => o.value
          );
          onChange(arr);
        } else {
          onChange(e.currentTarget.value);
        }
      }}
      className="w-full border rounded-lg px-3 py-2 bg-white"
    >
      {children}
    </select>
  );
}

function Rating({
  value,
  count,
}: {
  value?: number | null;
  count?: number | null;
}) {
  if (value == null && count == null) return null;
  const stars = value != null ? "★".repeat(Math.round(value)) : "";
  return (
    <div className="text-sm text-gray-700">
      <span className="mr-1">{stars}</span>
      {value != null ? value.toFixed(1) : ""}
      {count != null ? (
        <span className="ml-1 text-gray-500">({count})</span>
      ) : null}
    </div>
  );
}

/* ───────────── Page ───────────── */
export default function ExplorePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filters (initialized from URL)
  const [name, setName] = useState<string>(searchParams.get("q") || "");
  const [categoryIds, setCategoryIds] = useState<string[]>(
    parseMulti(searchParams.get("cats"))
  );
  const [regionIds, setRegionIds] = useState<string[]>(
    parseMulti(searchParams.get("regs"))
  );
  const [orderBy, setOrderBy] = useState<string>(
    searchParams.get("order") || "latest"
  );
  const [page, setPage] = useState<number>(
    Number(searchParams.get("page") || 1)
  );

  // Options
  const [categories, setCategories] = useState<Option[]>([]);
  const [regions, setRegions] = useState<Option[]>([]);

  // Results
  const [sites, setSites] = useState<Site[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load categories & regions once
  useEffect(() => {
    (async () => {
      const [{ data: cat }, { data: reg }] = await Promise.all([
        supabase
          .from("categories")
          .select("id,name")
          .order("name", { ascending: true }),
        supabase
          .from("regions")
          .select("id,name")
          .order("name", { ascending: true }),
      ]);
      setCategories(
        (cat as any[])?.map((c) => ({ id: c.id, name: c.name })) || []
      );
      setRegions(
        (reg as any[])?.map((r) => ({ id: r.id, name: r.name })) || []
      );
    })();
  }, []);

  // Build and fire query when filters/page change
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase.from("sites").select(
          `
            id, slug, title, tagline, cover_photo_url, location_free,
            avg_rating, review_count, created_at,
            site_categories!left(category_id),
            site_regions!left(region_id)
          `,
          { count: "exact" }
        );

        if (name.trim()) {
          query = query.ilike("title", `%${name.trim()}%`);
        }

        if (categoryIds.length > 0) {
          // Require at least one selected category (left join + filter on joined col)
          query = query.in("site_categories.category_id", categoryIds);
        }

        if (regionIds.length > 0) {
          query = query.in("site_regions.region_id", regionIds);
        }

        // Order by
        switch (orderBy) {
          case "top":
            query = query
              .order("avg_rating", { ascending: false, nullsFirst: false })
              .order("review_count", {
                ascending: false,
                nullsFirst: false,
              });
            break;
          case "random":
            // @ts-ignore - PostgREST supports order=rand() via 'order' with foreign.fn
            (query as any) = (query as any).order("random()", {
              ascending: true,
            });
            break;
          case "az":
            query = query.order("title", { ascending: true });
            break;
          case "latest":
          default:
            query = query.order("created_at", { ascending: false });
            break;
        }

        // Pagination
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        setSites((data as any[]).map((r) => r as Site));
        setTotal(count || 0);
      } catch (e: any) {
        setError(e?.message || "Failed to load results");
        setSites([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    })();
  }, [name, categoryIds, regionIds, orderBy, page]);

  // Keep URL in sync when the user hits Search button
  const applyFilters = () => {
    const qs = buildQueryString({
      q: name || undefined,
      cats: categoryIds.length ? categoryIds : undefined,
      regs: regionIds.length ? regionIds : undefined,
      order: orderBy !== "latest" ? orderBy : undefined,
      page: page !== 1 ? page : undefined,
    });
    router.push(`/explore${qs}`);
  };

  // Re‑apply when url changes (e.g., back/forward)
  useEffect(() => {
    setName(searchParams.get("q") || "");
    setCategoryIds(parseMulti(searchParams.get("cats")));
    setRegionIds(parseMulti(searchParams.get("regs")));
    setOrderBy(searchParams.get("order") || "latest");
    setPage(Number(searchParams.get("page") || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 py-6 lg:flex lg:items-start lg:gap-6">
        {/* LEFT: Search Panel */}
        <aside className="w-full lg:w-80 lg:flex-shrink-0">
          <SectionCard className="p-5 lg:sticky lg:top-6">
            <h1 className="text-xl font-semibold mb-4">Explore</h1>

            {/* Search by Name */}
            <div className="mb-4">
              <InputLabel>Search by Name</InputLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="e.g., Lahore Fort"
              />
            </div>

            {/* Heritage Type (Categories) */}
            <div className="mb-4">
              <InputLabel>Heritage Type</InputLabel>
              <Select
                multiple
                value={categoryIds}
                onChange={(v) => setCategoryIds(v as string[])}
              >
                {categories.length === 0 ? (
                  <option value="">Loading…</option>
                ) : null}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <button
                className="text-xs text-blue-600 mt-1"
                onClick={() => setCategoryIds([])}
                type="button"
              >
                Clear
              </button>
            </div>

            {/* Region */}
            <div className="mb-4">
              <InputLabel>Region</InputLabel>
              <Select
                multiple
                value={regionIds}
                onChange={(v) => setRegionIds(v as string[])}
              >
                {regions.length === 0 ? (
                  <option value="">Loading…</option>
                ) : null}
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
              <button
                className="text-xs text-blue-600 mt-1"
                onClick={() => setRegionIds([])}
                type="button"
              >
                Clear
              </button>
            </div>

            {/* Order By */}
            <div className="mb-6">
              <InputLabel>Order by</InputLabel>
              <Select value={orderBy} onChange={(v) => setOrderBy(v as string)}>
                <option value="top">Top Rated</option>
                <option value="latest">Latest</option>
                <option value="random">Random</option>
                <option value="az">A–Z</option>
              </Select>
            </div>

            <button
              onClick={() => {
                setPage(1);
                applyFilters();
              }}
              className="w-full py-2 rounded-lg bg-black text-white font-medium"
            >
              Search
            </button>
          </SectionCard>
        </aside>

        {/* RIGHT: Results */}
        <main className="w-full lg:flex-1">
          {/* Active filters summary */}
          <div className="mb-3 text-sm text-gray-600">
            {total} result{total === 1 ? "" : "s"}
          </div>

          <SectionCard className="p-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-56 bg-gray-100 animate-pulse rounded-lg"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-red-600">{error}</div>
            ) : sites.length === 0 ? (
              <div className="p-6 text-gray-700">
                No sites match your filters.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sites.map((s) => (
                    <article
                      key={s.id}
                      className="border rounded-lg overflow-hidden bg-white"
                    >
                      {s.cover_photo_url ? (
                        <img
                          src={s.cover_photo_url}
                          alt={s.title}
                          className="w-full h-40 object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-40 bg-gray-100" />
                      )}
                      <div className="p-3">
                        <h3 className="font-semibold">{s.title}</h3>
                        {s.tagline ? (
                          <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                            {s.tagline}
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {s.location_free || ""}
                          </span>
                          <Rating value={s.avg_rating} count={s.review_count} />
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Link
                            href={`/heritage/${s.slug}`}
                            className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
                          >
                            View
                          </Link>
                          <button className="px-3 py-1 rounded border text-sm hover:bg-gray-50">
                            Add to Trip
                          </button>
                          <button className="px-3 py-1 rounded border text-sm hover:bg-gray-50">
                            Bookmark
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    onClick={() => {
                      const p = Math.max(1, page - 1);
                      setPage(p);
                      router.push(
                        `/explore${buildQueryString({
                          q: name || undefined,
                          cats: categoryIds.length ? categoryIds : undefined,
                          regs: regionIds.length ? regionIds : undefined,
                          order: orderBy !== "latest" ? orderBy : undefined,
                          page: p !== 1 ? p : undefined,
                        })}`
                      );
                    }}
                    disabled={page <= 1}
                  >
                    Prev
                  </button>
                  <span className="text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    onClick={() => {
                      const p = Math.min(totalPages, page + 1);
                      setPage(p);
                      router.push(
                        `/explore${buildQueryString({
                          q: name || undefined,
                          cats: categoryIds.length ? categoryIds : undefined,
                          regs: regionIds.length ? regionIds : undefined,
                          order: orderBy !== "latest" ? orderBy : undefined,
                          page: p !== 1 ? p : undefined,
                        })}`
                      );
                    }}
                    disabled={page >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </SectionCard>
        </main>
      </div>
    </div>
  );
}
