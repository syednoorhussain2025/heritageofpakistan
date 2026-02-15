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
          <div className="relative">
            <div className="hop-cats-scroll overflow-x-auto overflow-y-hidden pr-10">
              <div className="grid grid-rows-3 grid-flow-col auto-cols-[minmax(240px,1fr)] gap-x-10 gap-y-4 min-w-max">
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
                          <Icon
                            name={iconKey}
                            size={16}
                            className="text-white"
                          />
                        ) : null}
                      </div>
                      <span className="font-category-chip transition-colors duration-200 group-hover:text-[var(--brand-orange)]">
                        {c.name}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>

            {categories.length > 3 && (
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
                <div className="absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-white via-white/90 to-transparent" />
                <span className="relative z-[1] inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/95 border border-slate-200 text-slate-500 shadow-sm">
                  <svg
                    viewBox="0 0 20 20"
                    width="13"
                    height="13"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M7.41 4.58a1 1 0 000 1.41L11.34 10l-3.93 4.01a1 1 0 101.42 1.42l4.64-4.72a1 1 0 000-1.42L8.83 4.58a1 1 0 00-1.42 0z" />
                  </svg>
                </span>
              </div>
            )}
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
        .hop-cats-scroll {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hop-cats-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </>
  );
}
