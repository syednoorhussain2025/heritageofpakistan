// Server component wrapper for the gallery page.
// Static configuration lives here so Next.js can apply it correctly.

export const dynamic = "force-static";
// Cache the rendered HTML for 1 year (in seconds)
export const revalidate = 31536000;

import GalleryClient from "./GalleryClient";

export default function Page() {
  return <GalleryClient />;
}
