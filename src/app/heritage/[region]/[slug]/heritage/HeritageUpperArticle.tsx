import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import HeritageSection from "./HeritageSection";
import { Taxonomy } from "./heritagedata";
import Icon from "@/components/Icon";

const MOBILE_CAT_PREVIEW = 3;

function CategoryItem({ c }: { c: Taxonomy }) {
  const iconKey = (c.icon_key || "").trim();
  return (
    <a
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
}

function CategoriesSlidePanel({
  categories,
  onClose,
  siteTitle,
}: {
  categories: Taxonomy[];
  onClose: () => void;
  siteTitle?: string;
}) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const el = document.getElementById("heritage-page-root");
    if (!el) return;
    el.style.transition = "transform 0.5s cubic-bezier(0.25,0.1,0.25,1)";
    const raf = requestAnimationFrame(() => {
      el.style.transform = closing ? "translateX(0)" : "translateX(-173px)";
    });
    return () => cancelAnimationFrame(raf);
  }, [closing]);

  function handleClose() {
    setClosing(true);
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[4999]"
        style={{
          backgroundColor: "rgba(0,0,0,0)",
          animation: closing
            ? "sideSheetBackdropOut 0.35s ease-in forwards"
            : "sideSheetBackdropIn 0.72s ease-out forwards",
        }}
      />
      <div
        className={`fixed inset-0 z-[5000] bg-white flex flex-col ${closing ? "animate-side-sheet-out" : "animate-side-sheet-in"}`}
        onAnimationEnd={() => { if (closing) onClose(); }}
      >
      <div className="relative flex items-center justify-center px-4 border-b border-slate-100" style={{ paddingTop: "calc(var(--sat, 44px) + 10px)", paddingBottom: "14px" }}>
        <button
          type="button"
          onClick={handleClose}
          className="absolute left-4 inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 shrink-0"
          aria-label="Back"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
          </svg>
        </button>
        <div className="flex flex-col items-center gap-0.5">
          {siteTitle && (
            <span className="text-[18px] font-extrabold" style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}>
              {siteTitle}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-bold bg-slate-100 text-[var(--brand-orange,#F78300)]">
            <Icon name="heritage-categories" size={13} className="text-[var(--brand-orange,#F78300)]" />
            Heritage Categories
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {(() => {
          // Group by parent_name; ungrouped items go under null
          const groups = new Map<string | null, typeof categories>();
          for (const c of categories) {
            const key = c.parent_name ?? null;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(c);
          }
          // Render grouped sections; ungrouped first if present
          return Array.from(groups.entries()).map(([groupName, items], idx) => (
            <div
              key={groupName ?? "__ungrouped__"}
              style={idx > 0 ? {
                backgroundImage: "linear-gradient(to right, transparent 1rem, #e2e8f0 1rem, #e2e8f0 calc(100% - 1rem), transparent calc(100% - 1rem))",
                backgroundPosition: "top",
                backgroundSize: "100% 1px",
                backgroundRepeat: "no-repeat",
              } : undefined}
            >
              {groupName && (
                <div className="px-4 pt-6 pb-2">
                  <h3
                    className="text-[18px] font-extrabold"
                    style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
                  >
                    {groupName}
                  </h3>
                </div>
              )}
              <div className="px-4 flex flex-col gap-0">
                {items.map((c) => (
                  <a
                    key={c.id}
                    href={`/explore?cats=${c.id}`}
                    className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-b-0 active:bg-slate-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)] flex items-center justify-center shrink-0">
                      {c.icon_svg ? (
                        <span
                          className="inline-block hop-category-svg text-white leading-none"
                          style={{ fontSize: 13 }}
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: c.icon_svg }}
                        />
                      ) : c.icon_key ? (
                        <Icon name={(c.icon_key || "").trim()} size={13} className="text-white" />
                      ) : null}
                    </div>
                    <span className="text-[15px] font-medium text-slate-800">{c.name}</span>
                  </a>
                ))}
              </div>
            </div>
          ));
        })()}
      </div>
    </div>
    </>,
    document.body
  );
}

export default function HeritageUpperArticle({
  categories,
  siteTitle,
}: {
  categories: Taxonomy[];
  siteTitle?: string;
}) {
  const [showPanel, setShowPanel] = useState(false);

  const previewCats = categories.slice(0, MOBILE_CAT_PREVIEW);
  const hasMore = categories.length > MOBILE_CAT_PREVIEW;

  return (
    <>
      {/* Mobile: horizontal scroll chiggps */}
      <section className="md:hidden px-4 pt-12 pb-12 mobile-divider mobile-divider-top" onClick={() => setShowPanel(true)}>
        {/* Header: title + count + chevron */}
        <div className="flex items-center justify-between mb-3">
          <h2
            className="flex items-center gap-2 text-[22px] font-extrabold"
            style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
          >
            <Icon name="heritage-categories" size={24} className="text-[var(--brand-orange)]" />
            <span>Heritage Categories</span>
            {categories.length > 0 && (
              <span className="text-[14px] font-semibold text-slate-400">({categories.length})</span>
            )}
          </h2>
          <span aria-hidden="true" className="inline-flex shrink-0 h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
              <path d="M7.41 4.58a1 1 0 000 1.41L11.34 10l-3.93 4.01a1 1 0 101.42 1.42l4.64-4.72a1 1 0 000-1.42L8.83 4.58a1 1 0 00-1.42 0z" />
            </svg>
          </span>
        </div>

        {categories.length > 0 ? (
          <>
            {/* Scroll row with right fade gradient */}
            <div className="relative -mx-4">
              <div className="hop-cats-scroll overflow-x-auto overflow-y-hidden px-4 py-2">
                <div className="flex gap-2 min-w-max pb-1">
                  {categories.slice(0, 4).map((c) => (
                    <div
                      key={c.id}
                      className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-slate-200 bg-white shrink-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)] flex items-center justify-center shrink-0">
                        {c.icon_svg ? (
                          <span
                            className="inline-block hop-category-svg text-white leading-none"
                            style={{ fontSize: 13 }}
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML={{ __html: c.icon_svg }}
                          />
                        ) : c.icon_key ? (
                          <Icon name={c.icon_key.trim()} size={13} className="text-white" />
                        ) : null}
                      </div>
                      <span className="text-[14px] font-semibold text-slate-700 whitespace-nowrap">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Fade gradient hint */}
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white to-transparent" />
            </div>
          </>
        ) : (
          <div className="text-[13px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
            No categories assigned.
          </div>
        )}
        {showPanel && (
          <CategoriesSlidePanel
            categories={categories}
            onClose={() => setShowPanel(false)}
            siteTitle={siteTitle}
          />
        )}
      </section>

      {/* Desktop: full scrollable grid (unchanged) */}
      <HeritageSection id="categories" title="" hideHeader className="hidden md:block">
        <h2
          className="mb-3 hidden md:flex items-center gap-2 text-[20px] font-extrabold"
          style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
        >
          <Icon name="heritage-categories" size={22} className="text-[var(--brand-orange)]" />
          <span>Heritage Categories</span>
        </h2>
        <div className="hidden md:block">
          {categories.length > 0 ? (
            <div className="relative">
              <div className="hop-cats-scroll overflow-x-auto overflow-y-hidden pr-14">
                <div className="grid grid-rows-3 grid-flow-col auto-cols-max gap-x-5 gap-y-4 min-w-max">
                  {categories.map((c) => (
                    <CategoryItem key={c.id} c={c} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[13px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
              No categories assigned.
            </div>
          )}
        </div>
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
