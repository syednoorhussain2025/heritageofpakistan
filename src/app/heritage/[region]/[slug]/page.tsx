// src/app/heritage/[region]/[slug]/page.tsx
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import HeritageClient from "./HeritageClient";

type Params = { region: string; slug: string };

type HeritagePageProps = {
  params: Promise<Params>;
};

async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
}

type HeroCoverForClient = {
  url: string;
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  blurDataURL?: string | null;
  caption?: string | null;
  credit?: string | null;
};

export default async function Page({ params }: HeritagePageProps) {
  const { region, slug } = await params;
  const supabase = await getSupabaseServerClient();

  /* 1. Fetch primary site */
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select(
      `
        id,
        slug,
        title,
        tagline,
        heritage_type,
        location_free,
        avg_rating,
        review_count,
        province_id,
        province:provinces!sites_province_id_fkey ( slug )
      `
    )
    .eq("slug", slug)
    .maybeSingle();

  if (siteErr || !site) return notFound();

  const provinceRel: any = (site as any).province;
  const provinceSlug: string | null = Array.isArray(provinceRel)
    ? provinceRel[0]?.slug ?? null
    : provinceRel?.slug ?? null;

  if (!provinceSlug || region !== provinceSlug) return notFound();

  /* 2. Fetch cover */
  const { data: coverRows } = await supabase
    .from("site_covers")
    .select(
      `
        storage_path,
        width,
        height,
        blur_hash,
        blur_data_url,
        caption,
        credit,
        is_active,
        sort_order,
        created_at
      `
    )
    .eq("site_id", site.id)
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);

  const coverRow = coverRows?.[0] ?? null;

  const publicUrl = (path: string | null) =>
    path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-images/${path}`
      : null;

  let coverForClient: HeroCoverForClient | undefined;
  if (coverRow) {
    const url = publicUrl(coverRow.storage_path);
    if (url) {
      coverForClient = {
        url,
        width: coverRow.width ?? null,
        height: coverRow.height ?? null,
        blurhash: coverRow.blur_hash ?? null,
        blurDataURL: coverRow.blur_data_url ?? null,
        caption: coverRow.caption ?? null,
        credit: coverRow.credit ?? null,
      };
    }
  }

  const siteDataForClient = {
    ...site,
    province_slug: provinceSlug,
    cover: coverForClient ?? null,
  };

  /* 3. Fetch neighbors (alphabetical inside same province) */
  let neighbors: any = { prev: null, next: null };

  const { data: list } = await supabase
    .from("sites")
    .select(
      `
        slug,
        title,
        tagline,
        province_id,
        provinces ( slug ),
        site_covers (
          storage_path,
          width,
          height,
          blur_hash,
          blur_data_url
        )
      `
    )
    .eq("province_id", site.province_id)
    .order("title", { ascending: true });

  if (list) {
    const index = list.findIndex((s) => s.slug === slug);

    const hydrate = (row: any) =>
      row
        ? {
            slug: row.slug,
            title: row.title,
            tagline: row.tagline ?? null,
            province_slug: row.provinces?.slug ?? null,
            cover: row.site_covers?.[0]
              ? {
                  url: publicUrl(row.site_covers[0].storage_path)!,
                  width: row.site_covers[0].width,
                  height: row.site_covers[0].height,
                  blurhash: row.site_covers[0].blur_hash,
                  blurDataURL: row.site_covers[0].blur_data_url,
                }
              : null,
          }
        : null;

    neighbors = {
      prev: hydrate(list[index - 1] ?? null),
      next: hydrate(list[index + 1] ?? null),
    };
  }

  /* 4. Render */
  return <HeritageClient site={siteDataForClient} neighbors={neighbors} />;
}

/* ---------------- SEO ---------------- */
export async function generateMetadata({ params }: HeritagePageProps) {
  const { region, slug } = await params;
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const canonical = `${base}/heritage/${region}/${slug}`;

  return {
    alternates: { canonical },
    openGraph: { url: canonical },
  };
}
