import HeritageSection from "./HeritageSection";
import { Site, Taxonomy } from "./heritagedata";
import Icon from "@/components/Icon";

function KeyVal({ k, v }: { k: string; v?: string | number | null }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-black/5 last:border-b-0">
      <div className="text-[13px] font-semibold text-slate-900">{k}</div>
      <div className="text-[13px] text-slate-700 text-right">{String(v)}</div>
    </div>
  );
}

function IconChip({
  iconName,
  label,
  id,
  href,
}: {
  iconName: string | null;
  label: string;
  id: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-2 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)] flex items-center justify-center flex-shrink-0">
        {iconName && <Icon name={iconName} size={16} className="text-white" />}
      </div>
      <span className="font-category-chip transition-colors duration-200 group-hover:text-[var(--brand-orange)]">
        {label}
      </span>
    </a>
  );
}

export default function HeritageSidebar({
  site,
  provinceName,
  regions,
  maps,
}: {
  site: Site;
  provinceName: string | null;
  regions: Taxonomy[];
  maps: { embed: string | null; link: string | null };
}) {
  return (
    <>
      <HeritageSection title="Where is it?" iconName="where-is-it">
        {maps.embed ? (
          <div className="w-full overflow-hidden rounded-lg">
            <iframe
              src={maps.embed}
              className="w-full h-56"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Map of ${site.title}`}
            />
          </div>
        ) : (
          <div
            className="text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            Location coordinates not available.
          </div>
        )}

        {maps.link && (
          <a
            href={maps.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
          >
            Open Location
          </a>
        )}

        <div className="mt-3 grid grid-cols-2 gap-4">
          <div className="text-[13px] font-semibold text-slate-900">
            Latitude
          </div>
          <div className="text-[13px] text-slate-700 text-right">
            {site.latitude ?? "—"}
          </div>
          <div className="text-[13px] font-semibold text-slate-900">
            Longitude
          </div>
          <div className="text-[13px] text-slate-700 text-right">
            {site.longitude ?? "—"}
          </div>
        </div>
      </HeritageSection>

      <HeritageSection id="location" title="Location" iconName="location">
        <KeyVal k="Town/City/Village" v={site.town_city_village} />
        <KeyVal k="Tehsil" v={site.tehsil} />
        <KeyVal k="District" v={site.district} />
        <KeyVal k="Region/Province" v={provinceName} />
        <KeyVal k="Latitude" v={site.latitude} />
        <KeyVal k="Longitude" v={site.longitude} />
      </HeritageSection>

      <HeritageSection title="Regions" iconName="regions">
        {regions.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {regions.map((r) => (
              <IconChip
                key={r.id}
                id={r.id}
                iconName={r.icon_key}
                label={r.name}
                href={`/explore?regs=${r.id}`}
              />
            ))}
          </div>
        ) : (
          <div
            className="text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            No regions specified.
          </div>
        )}
      </HeritageSection>

      <HeritageSection
        id="general"
        title="General Information"
        iconName="general-info"
      >
        <KeyVal k="Heritage Type" v={site.heritage_type} />
        <KeyVal k="Architectural Style" v={site.architectural_style} />
        <KeyVal k="Construction Materials" v={site.construction_materials} />
        <KeyVal k="Local Name" v={site.local_name} />
        <KeyVal k="Architect" v={site.architect} />
        <KeyVal k="Construction Date" v={site.construction_date} />
        <KeyVal k="Built by" v={site.built_by} />
        <KeyVal k="Dynasty" v={site.dynasty} />
        <KeyVal k="Conservation Status" v={site.conservation_status} />
        <KeyVal k="Current Use" v={site.current_use} />
        <KeyVal k="Restored by" v={site.restored_by} />
        <KeyVal k="Known for" v={site.known_for} />
        <KeyVal k="Era" v={site.era} />
        <KeyVal k="Inhabited by" v={site.inhabited_by} />
        <KeyVal
          k="National Park Established in"
          v={site.national_park_established_in}
        />
        <KeyVal k="Population" v={site.population} />
        <KeyVal k="Ethnic Groups" v={site.ethnic_groups} />
        <KeyVal k="Languages Spoken" v={site.languages_spoken} />
        <KeyVal k="Excavation Status" v={site.excavation_status} />
        <KeyVal k="Excavated by" v={site.excavated_by} />
        <KeyVal k="Administered by" v={site.administered_by} />
      </HeritageSection>

      <HeritageSection title="UNESCO" iconName="unesco">
        {site.unesco_status && site.unesco_status !== "None" ? (
          <div className="flex items-start gap-3">
            <div className="text-2xl">🏛️</div>
            <div>
              <div className="font-medium text-[13px] text-slate-900">
                {site.unesco_status}
              </div>
              {site.unesco_line && (
                <div
                  className="mt-1 text-[13px]"
                  style={{ color: "var(--muted-foreground, #5b6b84)" }}
                >
                  {site.unesco_line}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className="text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            No UNESCO designation listed.
          </div>
        )}
      </HeritageSection>

      <HeritageSection title="Protected under" iconName="protected-under">
        {site.protected_under ? (
          <div
            className="whitespace-pre-wrap text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            {site.protected_under}
          </div>
        ) : (
          <div
            className="text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            Not specified.
          </div>
        )}
      </HeritageSection>

      <HeritageSection
        title="Climate & Topography"
        iconName="climate-topography"
      >
        <KeyVal k="Landform" v={site.landform} />
        <KeyVal k="Altitude" v={site.altitude} />
        <KeyVal k="Mountain Range" v={site.mountain_range} />
        <KeyVal k="Weather Type" v={site.weather_type} />
        <KeyVal k="Avg Temp (Summers)" v={site.avg_temp_summers} />
        <KeyVal k="Avg Temp (Winters)" v={site.avg_temp_winters} />
      </HeritageSection>

      <HeritageSection title="Did you Know" iconName="did-you-know">
        {site.did_you_know ? (
          <div
            className="whitespace-pre-wrap text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            {site.did_you_know}
          </div>
        ) : (
          <div
            className="text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            —
          </div>
        )}
      </HeritageSection>

      <HeritageSection id="travel" title="Travel Guide" iconName="travel-guide">
        <KeyVal k="Heritage Site" v={site.title} />
        <KeyVal k="Location" v={site.travel_location} />
        <KeyVal k="How to Reach" v={site.travel_how_to_reach} />
        <KeyVal k="Nearest Major City" v={site.travel_nearest_major_city} />
        <KeyVal k="Airport Access" v={site.travel_airport_access} />
        <KeyVal k="International Flight" v={site.travel_international_flight} />
        <KeyVal k="Access Options" v={site.travel_access_options} />
        <KeyVal k="Road Type & Condition" v={site.travel_road_type_condition} />
        <KeyVal k="Best Time to Visit" v={site.travel_best_time_free} />
        {site.travel_full_guide_url && (
          <a
            href={site.travel_full_guide_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
          >
            Open Full Travel Guide
          </a>
        )}
      </HeritageSection>

      <HeritageSection title="Best Time to Visit" iconName="best-time-to-visit">
        {site.best_time_option_key ? (
          <div
            className="text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            {site.best_time_option_key}
          </div>
        ) : (
          <div
            className="text-[13px]"
            style={{ color: "var(--muted-foreground, #5b6b84)" }}
          >
            —
          </div>
        )}
      </HeritageSection>

      <HeritageSection title="Places to Stay" iconName="places-to-stay">
        <KeyVal k="Hotels Available" v={site.stay_hotels_available} />
        <KeyVal
          k="Spending Night Recommended"
          v={site.stay_spending_night_recommended}
        />
        <KeyVal k="Camping Possible" v={site.stay_camping_possible} />
        <KeyVal
          k="Places to Eat Available"
          v={site.stay_places_to_eat_available}
        />
      </HeritageSection>
    </>
  );
}
