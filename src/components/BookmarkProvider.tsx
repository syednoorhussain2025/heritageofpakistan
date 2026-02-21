"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createClient } from "@/lib/supabase/browser";
import { withTimeout } from "@/lib/async/withTimeout";
import Icon from "./Icon";

type Toast = {
  message: string;
  type: "add" | "remove";
};

type BookmarkContextType = {
  bookmarkedIds: Set<string>;
  toggleBookmark: (siteId: string) => void;
  isLoaded: boolean;
};

const BookmarkContext = createContext<BookmarkContextType>({
  bookmarkedIds: new Set(),
  toggleBookmark: () => {},
  isLoaded: false,
});

export const useBookmarks = () => useContext(BookmarkContext);

export function BookmarkProvider({ children }: { children: React.ReactNode }) {
  const QUERY_TIMEOUT_MS = 12000;
  const supabase = useMemo(() => createClient(), []);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const getSignedInUserId = useCallback(async (): Promise<string | null> => {
    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      return sessionData.session?.user?.id ?? null;
    } catch (error) {
      console.warn("[BookmarkProvider] session check failed", error);
      return null;
    }
  }, [supabase]);

  const refreshBookmarks = useCallback(async () => {
    try {
      const userId = await getSignedInUserId();
      if (!userId) {
        setBookmarkedIds(new Set());
        return;
      }

      const { data, error } = await withTimeout(
        supabase.from("bookmarks").select("site_id").eq("user_id", userId),
        QUERY_TIMEOUT_MS,
        "bookmarks.refresh"
      );

      if (error) throw error;
      setBookmarkedIds(new Set((data ?? []).map((b) => b.site_id)));
    } catch (error) {
      console.warn("[BookmarkProvider] failed to refresh bookmarks", error);
      setBookmarkedIds(new Set());
    } finally {
      setIsLoaded(true);
    }
  }, [getSignedInUserId, supabase]);

  useEffect(() => {
    void refreshBookmarks();
  }, [refreshBookmarks]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event !== "INITIAL_SESSION" &&
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      ) {
        return;
      }

      if (!session?.user) {
        setBookmarkedIds(new Set());
        setIsLoaded(true);
        return;
      }
      void refreshBookmarks();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshBookmarks, supabase]);

  const showToast = (message: string, type: "add" | "remove") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleBookmark = useCallback(
    async (siteId: string) => {
      const userId = await getSignedInUserId();
      if (!userId) {
        alert("Please sign in to bookmark sites.");
        return;
      }

      const isBookmarked = bookmarkedIds.has(siteId);
      if (isBookmarked) {
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          next.delete(siteId);
          return next;
        });

        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .match({ user_id: userId, site_id: siteId });

        if (error) {
          setBookmarkedIds((prev) => new Set(prev).add(siteId));
          console.warn("[BookmarkProvider] remove failed", error);
          alert("Failed to update bookmark. Please try again.");
          return;
        }

        showToast("Removed from Bookmarks", "remove");
      } else {
        setBookmarkedIds((prev) => new Set(prev).add(siteId));

        const { error } = await supabase
          .from("bookmarks")
          .insert({ user_id: userId, site_id: siteId });

        if (error) {
          setBookmarkedIds((prev) => {
            const next = new Set(prev);
            next.delete(siteId);
            return next;
          });
          console.warn("[BookmarkProvider] insert failed", error);
          alert("Failed to update bookmark. Please try again.");
          return;
        }

        showToast("Added to Bookmarks", "add");
      }
    },
    [bookmarkedIds, getSignedInUserId, supabase]
  );

  return (
    <BookmarkContext.Provider
      value={{ bookmarkedIds, toggleBookmark, isLoaded }}
    >
      {children}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-fadeIn">
          <Icon
            name={toast.type === "add" ? "heart" : "trash"}
            className="text-[var(--brand-orange)]"
          />
          <span>{toast.message}</span>
        </div>
      )}
    </BookmarkContext.Provider>
  );
}
