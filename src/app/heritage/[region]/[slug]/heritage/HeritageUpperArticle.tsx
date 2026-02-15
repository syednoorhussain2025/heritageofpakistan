import HeritageSection from "./HeritageSection";
import { Taxonomy } from "./heritagedata";
import Icon from "@/components/Icon";

export default function HeritageUpperArticle({
  categories,
}: {
  categories: Taxonomy[];
}) {
  return (
    <>
      {/* Removed the Photo Story section */}

      <HeritageSection
        id="categories"
        title="Heritage Categories"
        iconName="heritage-categories"
      >
        {categories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((c) => {
              const iconKey = (c.icon_key || "").trim();

              return (
                <a
                  key={c.id}
                  href={`/explore?cats=${c.id}`}
                  className="group inline-flex items-center gap-2 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)] flex items-center justify-center flex-shrink-0">
                    {c.icon_svg ? (
                      <span
                        className="inline-block hop-category-svg text-white leading-none"
                        style={{ fontSize: 16 }}
                        // Icon SVG content is sanitized before persistence in admin.
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: c.icon_svg }}
                      />
                    ) : iconKey ? (
                      <Icon name={iconKey} size={16} className="text-white" />
                    ) : null}
                  </div>
                  <span className="font-category-chip transition-colors duration-200 group-hover:text-[var(--brand-orange)]">
                    {c.name}
                  </span>
                </a>
              );
            })}
          </div>
        ) : (
          <div
            className="text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            No categories assigned.
          </div>
        )}
      </HeritageSection>
      <style jsx global>{`
        .hop-category-svg svg {
          width: 1em;
          height: 1em;
          fill: currentColor;
        }
      `}</style>
    </>
  );
}
