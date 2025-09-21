import HeritageSection from "./HeritageSection";

export default function HeritageNearby({
  siteId,
  lat,
  lng,
}: {
  siteId: string;
  lat?: number | null;
  lng?: number | null;
}) {
  return (
    <HeritageSection id="nearby" title="Places Nearby" iconName="map-pin">
      <div
        className="text-[13px]"
        style={{ color: "var(--muted-foreground, #5b6b84)" }}
      >
        Coming soon.
      </div>
    </HeritageSection>
  );
}
