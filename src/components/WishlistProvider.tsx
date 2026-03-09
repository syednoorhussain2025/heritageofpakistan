"use client";

import { createContext, useContext, useEffect, useMemo, useCallback, useState } from "react";
import { getWishlists } from "@/lib/wishlists";
import { createClient } from "@/lib/supabase/browser";

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
  const sb = useMemo(() => createClient(), []);
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
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
  }, []);

  // Only load wishlists when a user is actually signed in, and clear them on sign-out.
  // This avoids a wasted DB query on every unauthenticated page load.
  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT" || (!session?.user && event === "INITIAL_SESSION")) {
        setWishlists([]);
        setLoading(false);
        return;
      }
      if (
        (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") &&
        session?.user
      ) {
        void refresh();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [sb, refresh]);

  const value = useMemo<WishlistContextValue>(
    () => ({ wishlists, loading, refresh, setWishlistsUnsafe: setWishlists }),
    [wishlists, loading, refresh]
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
