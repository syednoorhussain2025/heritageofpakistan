// src/components/Icon.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
} from "react";
import { supabase } from "@/lib/supabaseClient";

// --- Types ---
type IconData = {
  name: string;
  svg_content: string;
};

type IconContextType = {
  icons: Map<string, string>;
  isLoaded: boolean;
};

// --- React Context ---
const IconContext = createContext<IconContextType>({
  icons: new Map(),
  isLoaded: false,
});

/**
 * A provider that fetches all icons from the database on initial load
 * and makes them available to all <Icon /> components via context.
 * This avoids fetching the same icon multiple times.
 */
export function IconProvider({ children }: { children: React.ReactNode }) {
  const [icons, setIcons] = useState<Map<string, string>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function fetchIcons() {
      // We only need the name and the pre-processed SVG content.
      const { data, error } = await supabase
        .from("icons")
        .select("name, svg_content");

      if (error) {
        console.error("Failed to fetch icons:", error);
        setIsLoaded(true); // Mark as loaded even on error to unblock rendering
        return;
      }

      const iconMap = new Map<string, string>();
      if (data) {
        for (const icon of data as IconData[]) {
          iconMap.set(icon.name, icon.svg_content);
        }
      }
      setIcons(iconMap);
      setIsLoaded(true);
    }

    fetchIcons();
  }, []);

  const value = useMemo(() => ({ icons, isLoaded }), [icons, isLoaded]);

  return <IconContext.Provider value={value}>{children}</IconContext.Provider>;
}

// --- Custom Hook ---
export const useIcons = () => useContext(IconContext);

// --- The Universal <Icon /> Component ---
interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: number | string;
}

/**
 * Renders an SVG icon from the global icon cache.
 * @param name The unique key of the icon (e.g., "fort-outline").
 * @param size Optional size for the icon (e.g., 24 or "1.5rem").
 * @param className Optional classes to apply to the wrapper span.
 */
export default function Icon({ name, size, className, ...props }: IconProps) {
  const { icons, isLoaded } = useIcons();
  const svgContent = icons.get(name);

  // While loading, or if the icon doesn't exist, render a placeholder
  if (!isLoaded || !svgContent) {
    return (
      <span
        // UPDATED: Changed bg-gray-300 to bg-transparent to make the placeholder invisible
        className={`inline-block bg-transparent rounded ${className || ""}`}
        style={{ width: size || "1em", height: size || "1em" }}
        aria-label={`Loading icon: ${name}`}
        {...props}
      />
    );
  }

  return (
    <span
      className={`inline-block ${className || ""}`}
      style={{ fontSize: size }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
      {...props}
    />
  );
}
