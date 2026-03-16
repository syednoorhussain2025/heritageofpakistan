// Server layout: pre-fetch map bootstrap so the client gets data with the page (no wait).
// Same pattern as root layout + fetchHeaderItems. Makes /map fast and dependable.

import { fetchMapBootstrap } from "@/lib/mapBootstrap";
import { MapBootstrapProvider } from "@/components/MapBootstrapProvider";

export default async function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialBootstrap = null;
  try {
    initialBootstrap = await fetchMapBootstrap();
  } catch {
    // Client will fall back to fetch + cache
  }

  return (
    <MapBootstrapProvider initialBootstrap={initialBootstrap}>
      {children}
    </MapBootstrapProvider>
  );
}
