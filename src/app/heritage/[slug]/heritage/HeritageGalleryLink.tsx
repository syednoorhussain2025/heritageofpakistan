import HeritageSection from "./HeritageSection";
import { ImageRow } from "./heritagedata";

export default function HeritageGalleryLink({
  siteSlug,
  gallery,
}: {
  siteSlug: string;
  gallery: ImageRow[];
}) {
  return (
    <HeritageSection id="gallery" title="Photo Gallery" iconName="gallery">
      {gallery.length ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {gallery.map((img) => (
              <figure
                key={img.id}
                className="bg-gray-100 rounded-lg overflow-hidden"
              >
                {img.publicUrl ? (
                  <img
                    src={img.publicUrl}
                    alt={img.alt_text || ""}
                    className="w-full h-40 object-cover"
                  />
                ) : (
                  <div className="w-full h-40" />
                )}
                {(img.caption || img.credit) && (
                  <figcaption className="px-2 py-1 font-caption">
                    {img.caption}
                    {img.credit && <span className="ml-1">({img.credit})</span>}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
          <a
            href={`/heritage/${siteSlug}/gallery`}
            className="mt-3 inline-block px-4 py-2 rounded-lg bg-black text-white text-sm"
          >
            Open Photo Gallery
          </a>
        </>
      ) : (
        <div
          className="text-[13px]"
          style={{ color: "var(--muted-foreground, #5b6b84)" }}
        >
          No photos uploaded yet.
        </div>
      )}
    </HeritageSection>
  );
}
