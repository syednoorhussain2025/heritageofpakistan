// src/app/dashboard/SearchContext.tsx
"use client";

import { createContext, useContext } from "react";

export const SearchContext = createContext<{ q: string }>({ q: "" });

export function useSearchQ() {
  return useContext(SearchContext).q;
}
