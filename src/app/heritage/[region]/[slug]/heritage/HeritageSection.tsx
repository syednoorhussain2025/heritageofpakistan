import Icon from "@/components/Icon";

type HeritageSectionProps = {
  title: string;
  iconName?: string;
  children: React.ReactNode;
  id?: string;
  /** Removes the outer white card wrapper when true (default: false) */
  noFrame?: boolean;
  /** Hides the section heading (useful when inner cards provide their own) */
  hideHeader?: boolean;
};

export default function HeritageSection({
  title,
  iconName,
  children,
  id,
  noFrame = false,
  hideHeader = false,
}: HeritageSectionProps) {
  return (
    <section
      className={noFrame ? "w-full" : "bg-white rounded-xl shadow-sm p-5"}
    >
      {/* Keep an anchor for scroll targeting even when header is hidden */}
      {hideHeader ? (
        <div id={id} className="scroll-mt-[var(--sticky-offset)]" />
      ) : (
        <h2
          id={id}
          className="mb-3 flex items-center gap-2 scroll-mt-[var(--sticky-offset)] text-[17px] md:text-[18px] font-semibold"
          style={{
            color: "var(--brand-blue, #1f6be0)",
            fontFamily: "var(--font-article-heading, inherit)",
          }}
        >
          {iconName && (
            <Icon
              name={iconName}
              size={18}
              className="text-[var(--brand-orange)]"
            />
          )}
          <span>{title}</span>
        </h2>
      )}
      {children}
    </section>
  );
}
