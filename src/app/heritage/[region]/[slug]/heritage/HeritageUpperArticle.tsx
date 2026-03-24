import { useState } from "react";
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
}: {
  categories: Taxonomy[];
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  function handleClose() {
    setClosing(true);
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[5000] bg-white flex flex-col ${closing ? "animate-slide-out-right" : "animate-slide-in-right"}`}
      onAnimationEnd={() => { if (closing) onClose(); }}
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600"
          aria-label="Back"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
          </svg>
        </button>
        <h2 className="text-[17px] font-bold text-[var(--brand-blue)]">Heritage Categories</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {categories.map((c) => (
          <CategoryItem key={c.id} c={c} />
        ))}
      </div>
    </div>,
    document.body
  );
}

export default function HeritageUpperArticle({
  categories,
}: {
  categories: Taxonomy[];
}) {
  const [showPanel, setShowPanel] = useState(false);

  const previewCats = categories.slice(0, MOBILE_CAT_PREVIEW);
  const hasMore = categories.length > MOBILE_CAT_PREVIEW;

  return (
    <>
      {/* Mobile: whole card is one tap target */}
      <section className="md:hidden bg-white">
        <button
          type="button"
          onClick={hasMore ? () => setShowPanel(true) : undefined}
          className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left cursor-pointer active:bg-slate-50"
        >
          <h2
            className="flex items-center gap-2 text-[22px] font-extrabold"
            style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
          >
            <Icon name="heritage-categories" size={18} className="text-[var(--brand-orange)]" />
            <span>Heritage Categories</span>
          </h2>
          {hasMore && (
            <span aria-hidden="true" className="inline-flex shrink-0 h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500">
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                <path d="M7.41 4.58a1 1 0 000 1.41L11.34 10l-3.93 4.01a1 1 0 101.42 1.42l4.64-4.72a1 1 0 000-1.42L8.83 4.58a1 1 0 00-1.42 0z" />
              </svg>
            </span>
          )}
        </button>
        <div className="px-4 pb-4">
          {categories.length > 0 ? (
            <div className="space-y-4">
              {previewCats.map((c) => (
                <CategoryItem key={c.id} c={c} />
              ))}
            </div>
          ) : (
            <div className="text-[13px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
              No categories assigned.
            </div>
          )}
        </div>
        {showPanel && (
          <CategoriesSlidePanel
            categories={categories}
            onClose={() => setShowPanel(false)}
          />
        )}
      </section>

      {/* Desktop: full scrollable grid (unchanged) */}
      <HeritageSection id="categories" title="" hideHeader>
        <h2
          className="mb-3 hidden md:flex items-center gap-2 text-[17px] md:text-[18px] font-semibold"
          style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
        >
          <Icon name="heritage-categories" size={18} className="text-[var(--brand-orange)]" />
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
