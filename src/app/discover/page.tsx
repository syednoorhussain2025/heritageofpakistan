import dynamic from "next/dynamic";

const DiscoverClient = dynamic(() => import("./DiscoverClient"), { ssr: false });

export default function DiscoverPage() {
  return <DiscoverClient initialPhotos={[]} />;
}
