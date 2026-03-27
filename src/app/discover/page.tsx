import { fetchDiscoverPhotos } from "@/lib/discover-actions";
import DiscoverClient from "./DiscoverClient";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  // Use a fixed seed for the initial SSR load; client takes over with its own seed
  const initialPhotos = await fetchDiscoverPhotos(0, 0.5);

  return <DiscoverClient initialPhotos={initialPhotos} />;
}
