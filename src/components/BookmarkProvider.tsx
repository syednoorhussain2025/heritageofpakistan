// src/components/BookmarkProvider.tsx
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
  const supabase = useMemo(() => createClient(), []);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    const fetchBookmarks = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("bookmarks")
          .select("site_id")
          .eq("user_id", user.id);

        if (data) {
          setBookmarkedIds(new Set(data.map((b) => b.site_id)));
        }
      }
      setIsLoaded(true);
    };
    fetchBookmarks();
  }, [supabase]);

  const showToast = (message: string, type: "add" | "remove") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleBookmark = useCallback(
    async (siteId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert("Please sign in to bookmark sites.");
        return;
      }

      const isBookmarked = bookmarkedIds.has(siteId);
      if (isBookmarked) {
        setBookmarkedIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(siteId);
          return newSet;
        });
        await supabase
          .from("bookmarks")
          .delete()
          .match({ user_id: user.id, site_id: siteId });
        showToast("Removed from Bookmarks", "remove");
      } else {
        setBookmarkedIds((prev) => new Set(prev).add(siteId));
        await supabase
          .from("bookmarks")
          .insert({ user_id: user.id, site_id: siteId });
        showToast("Added to Bookmarks", "add");
      }
    },
    [bookmarkedIds, supabase]
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
            className="text-[var(--brand-orange)]" // UPDATED
          />
          <span>{toast.message}</span>
        </div>
      )}
    </BookmarkContext.Provider>
  );
}
