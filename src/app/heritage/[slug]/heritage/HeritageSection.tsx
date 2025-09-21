import Icon from "@/components/Icon";

export default function HeritageSection({
  title,
  iconName,
  children,
  id,
}: {
  title: string;
  iconName?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="bg-white rounded-xl shadow-sm p-5">
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
      {children}
    </section>
  );
}
