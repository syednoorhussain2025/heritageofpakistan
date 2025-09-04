import { supabase } from "@/lib/supabaseClient";
import type {
  ArchetypeSlug,
  SectionSettings,
  DEFAULT_SETTINGS,
} from "./default-sections";

export type SectionTypeRow = {
  id: string;
  name: string;
  slug: string;
  version: number;
  enabled: boolean;
  config_json: SectionSettings;
};

export type TemplateRow = {
  id: string;
  name: string;
  slug: string;
  version: number;
};

const DEFAULT_META: Record<ArchetypeSlug, { name: string }> = {
  "full-width-image": { name: "Full-width Image" },
  "image-left-text-right": { name: "Image Left + Text Right" },
  "image-right-text-left": { name: "Image Right + Text Left" },
  "two-images": { name: "Two Images Side-by-Side" },
  "three-images": { name: "Three Images Side-by-Side" },
};

/** Seed 5 default section_types (idempotent). config_json stores settings only. */
export async function seedDefaultSectionTypes(
  defaults: typeof DEFAULT_SETTINGS
) {
  const { data: rows } = await supabase
    .from("section_types")
    .select("id, slug");
  const have = new Set((rows || []).map((r: any) => r.slug));
  const toCreate: any[] = [];
  (Object.keys(DEFAULT_META) as ArchetypeSlug[]).forEach((slug) => {
    if (!have.has(slug)) {
      toCreate.push({
        name: DEFAULT_META[slug].name,
        slug,
        version: 1,
        enabled: true,
        config_json: defaults[slug],
      });
    }
  });
  if (toCreate.length) {
    const { error } = await supabase.from("section_types").insert(toCreate);
    if (error) throw error;
  }
}

/** Read all 5 rows (after seed) */
export async function loadArchetypeRows(): Promise<SectionTypeRow[]> {
  const { data, error } = await supabase
    .from("section_types")
    .select("*")
    .in("slug", Object.keys(DEFAULT_META))
    .order("name");
  if (error) throw error;
  return (data || []) as SectionTypeRow[];
}

/** Update settings for a single archetype row */
export async function updateArchetypeSettings(
  id: string,
  settings: SectionSettings
) {
  const { data, error } = await supabase
    .from("section_types")
    .update({
      config_json: settings,
      version: supabase.rpc ? undefined : undefined, // keep version simple
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SectionTypeRow;
}

/** Templates API unchanged */
export async function loadTemplates(): Promise<{ rows: TemplateRow[] }> {
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, slug, version")
    .order("name");
  if (error) throw error;
  return { rows: data as TemplateRow[] };
}

export async function upsertTemplate(
  tpl: Partial<TemplateRow> & { sections: { section_type_id: string }[] }
): Promise<TemplateRow> {
  let tplRow: TemplateRow;
  if (tpl.id) {
    const { data, error } = await supabase
      .from("templates")
      .update({
        name: tpl.name,
        slug: tpl.slug,
        version: (tpl.version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tpl.id)
      .select()
      .single();
    if (error) throw error;
    tplRow = data as TemplateRow;
    await supabase
      .from("template_sections")
      .delete()
      .eq("template_id", tplRow.id);
  } else {
    const { data, error } = await supabase
      .from("templates")
      .insert({
        name: tpl.name,
        slug: tpl.slug,
        version: 1,
      })
      .select()
      .single();
    if (error) throw error;
    tplRow = data as TemplateRow;
  }
  if (tpl.sections?.length) {
    const rows = tpl.sections.map((s, i) => ({
      template_id: tplRow.id,
      section_type_id: s.section_type_id,
      sort_order: i,
      overrides_json: null,
    }));
    const { error } = await supabase.from("template_sections").insert(rows);
    if (error) throw error;
  }
  return tplRow;
}
