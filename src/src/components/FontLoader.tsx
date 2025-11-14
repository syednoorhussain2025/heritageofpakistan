// app/components/FontLoader.tsx

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// Helper function to generate a @font-face rule
function createFontFace(font: any) {
  if (!font.url || font.provider !== "custom") return "";

  const formatMap = {
    woff2: "woff2",
    woff: "woff",
    ttf: "truetype",
    otf: "opentype",
  };
  const extension = font.url
    .split(".")
    .pop()
    ?.toLowerCase() as keyof typeof formatMap;
  const format = formatMap[extension] || "truetype";

  return `
    @font-face {
      font-family: "${font.css_family}";
      src: url("${font.url}") format("${format}");
      font-weight: ${font.weight || 400};
      font-style: ${font.style || "normal"};
      font-display: swap;
    }
  `;
}

export default async function FontLoader() {
  const supabase = createServerComponentClient({ cookies });
  const { data: fonts } = await supabase.from("fonts").select("*");

  if (!fonts) {
    return null;
  }

  // 1. Separate Google Fonts and Custom Fonts
  const googleFonts = fonts.filter((f) => f.provider === "google");
  const customFonts = fonts.filter((f) => f.provider === "custom");

  // 2. Get unique Google Font stylesheet links
  const googleFontHrefs = [
    ...new Set(googleFonts.map((font) => font.metadata?.href)),
  ].filter(Boolean);

  // 3. Generate all @font-face rules for custom fonts
  const customFontStyles = customFonts.map(createFontFace).join("\n");

  return (
    <>
      {/* Inject link tags for all Google Fonts */}
      {googleFontHrefs.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}

      {/* Inject a style tag for all self-hosted custom fonts */}
      <style dangerouslySetInnerHTML={{ __html: customFontStyles }} />
    </>
  );
}
