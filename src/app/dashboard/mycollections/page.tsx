// src/app/dashboard/mycollections/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { NoCollections } from "@/components/illustrations/NoCollections";
import { deletePhotoCollection } from "@/lib/photoCollections";
import { hapticLight, hapticHeavy, hapticMedium } from "@/lib/haptics";
import { useSearchQ } from "../SearchContext";
import { useCollections, dashboardKeys } from "@/hooks/useDashboardQueries";
import { useQueryClient } from "@tanstack/react-query";

export default function MyCollectionsPage() {
  const router = useRouter();
  const { data: albums = [], isLoading } = useCollections();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const q = useSearchQ();

  const filtered = useMemo(() =>
    q.trim() ? albums.filter((a: any) => a.name.toLowerCase().includes(q.trim().toLowerCase())) : albums,
    [albums, q]
  );

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete collection "${name}"? This will not affect your library.`)) return;
    setDeletingId(id);
    try {
      await deletePhotoCollection(id);
      queryClient.setQueryData(dashboardKeys.collections("me"), (old: any[]) =>
        (old ?? []).filter((a) => a.id !== id)
      );
      setToast(`"${name}" deleted`);
      setTimeout(() => setToast(null), 2500);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {toast && (
        <div className="pointer-events-none fixed left-1/2 bottom-28 -translate-x-1/2 z-[9999] rounded-xl bg-gray-900/90 text-white text-sm px-4 py-2.5 shadow-lg whitespace-nowrap">
          {toast}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 animate-pulse">
              <div className="w-14 h-14 rounded-xl bg-gray-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <p className="text-[17px] font-semibold text-gray-800 mb-6">No Collections Created Yet</p>
          <NoCollections className="w-full max-w-[280px] mb-8" />
          <p className="text-sm text-gray-400">Use "Add to Collection" from any photo to get started.</p>
        </div>
      ) : filtered.length === 0 && q.trim() ? (
        <p className="text-center text-sm text-gray-400 py-6">No collections match "{q}"</p>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          {filtered.map((a: any, i: number) => (
            <div key={a.id} className="relative">
              {i > 0 && <span className="absolute top-0 right-0 left-[68px] h-px bg-gray-100" />}
              <Link
                href={`/dashboard/mycollections/${a.id}`}
                onClick={() => void hapticLight()}
                className="flex items-center gap-4 px-4 py-4 active:bg-gray-50 transition-colors"
              >
                <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100 ring-1 ring-black/5">
                  {a.firstPhotoUrl ? (
                    <img src={a.firstPhotoUrl} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Icon name="images" size={20} />
                    </div>
                  )}
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                    <Icon name="camera" size={9} className="text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-[var(--brand-black)] truncate">{a.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {a.is_public ? "public" : "private"} · {a.itemCount ?? 0} {(a.itemCount ?? 0) === 1 ? "photo" : "photos"}
                  </div>
                </div>
                <Icon name="chevron-right" size={13} className="text-[var(--brand-light-grey)] shrink-0 mr-1" />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void hapticHeavy();
                    void handleDelete(a.id, a.name);
                  }}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 active:bg-red-50 active:text-red-500 transition-colors shrink-0"
                  aria-label="Delete collection"
                >
                  {deletingId === a.id ? (
                    <span className="inline-block rounded-full border-2 border-gray-300 border-t-transparent animate-spin w-4 h-4" />
                  ) : (
                    <Icon name="times" size={14} />
                  )}
                </button>
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="lg:hidden fixed inset-x-0 bottom-0 z-[500] bg-white border-t border-gray-100 px-4 py-3"
        style={{ paddingBottom: "calc(52px + var(--safe-bottom, 0px) + 12px)" }}>
        <button
          type="button"
          onClick={() => { void hapticMedium(); router.push("/dashboard/mycollections/photos"); }}
          className="w-full rounded-full py-3.5 font-bold text-white active:opacity-80 transition"
          style={{ backgroundColor: "var(--brand-green)" }}
        >
          See all Collected Photos
        </button>
      </div>
      <div className="hidden lg:block pt-4">
        <Link
          href="/dashboard/mycollections/photos"
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white active:opacity-80"
          style={{ backgroundColor: "var(--brand-green)" }}
        >
          <Icon name="images" size={16} />
          See all Collected Photos
        </Link>
      </div>
    </>
  );
}
