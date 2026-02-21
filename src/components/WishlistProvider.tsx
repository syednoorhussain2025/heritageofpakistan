"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getWishlists } from "@/lib/wishlists";

/** Narrow type for items returned by `getWishlists()` */
export type Wishlist = {
  id: string;
  name: string;
  is_public: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  /** Supabase aggregate: e.g., [{ count: number }] */
  wishlist_items?: { count: number }[];
};

type WishlistContextValue = {
  wishlists: Wishlist[];
  loading: boolean;
  refresh: () => Promise<void>;
  /** Optional escape hatch for optimistic updates if you ever need it */
  setWishlistsUnsafe?: React.Dispatch<React.SetStateAction<Wishlist[]>>;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = (await getWishlists()) ?? [];
      setWishlists(data as Wishlist[]);
    } catch (err) {
      console.warn("[WishlistProvider] getWishlists failed:", err);
      setWishlists([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial load
    refresh();
  }, []);

  const value = useMemo<WishlistContextValue>(
    () => ({ wishlists, loading, refresh, setWishlistsUnsafe: setWishlists }),
    [wishlists, loading]
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

/**
 * Safe hook: returns inert defaults if the provider isn't mounted,
 * preventing 'Cannot destructure ... as it is null' runtime errors.
 */
export function useWishlists(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    return {
      wishlists: [],
      loading: false,
      refresh: async () => {},
    };
  }
  return ctx;
}
