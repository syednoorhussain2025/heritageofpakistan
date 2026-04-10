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
  className?: string;
  style?: React.CSSProperties;
};

export default function HeritageSection({
  title,
  iconName,
  children,
  id,
  noFrame = false,
  hideHeader = false,
  className,
  style,
}: HeritageSectionProps) {
  return (
    <section
      className={className ?? (noFrame ? "w-full" : "px-4 py-12 md:bg-white md:rounded-2xl md:py-6 md:px-6")}
      style={style}
    >
      {/* Keep an anchor for scroll targeting even when header is hidden */}
      {hideHeader ? (
        <div id={id} className="scroll-mt-[var(--sticky-offset)]" />
      ) : (
        <h2
          id={id}
          className="mb-3 flex items-center gap-2 scroll-mt-[var(--sticky-offset)] text-[22px] md:text-[20px] font-extrabold"
          style={{
            color: "var(--brand-blue, #1f6be0)",
            fontFamily: "var(--font-article-heading, inherit)",
          }}
        >
          {iconName && (
            <>
              <span className="md:hidden"><Icon name={iconName} size={24} className="text-[var(--brand-orange)]" /></span>
              <span className="hidden md:inline"><Icon name={iconName} size={22} className="text-[var(--brand-orange)]" /></span>
            </>
          )}
          <span>{title}</span>
        </h2>
      )}
      {children}
    </section>
  );
}
