// src/app/heritage/[region]/[slug]/page.tsx
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import HeritageClient from "./HeritageClient";

type Params = { region: string; slug: string };

type HeritagePageProps = {
  // Next.js 15: params is now a Promise
  params: Promise<Params>;
};

/** Build a Supabase server client bound to request cookies. */
async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        // In RSC these are effectively no-ops; fine for reads.
        set: () => {},
        remove: () => {},
      },
    }
  );
}

/** Shape of the cover expected by the client component (structurally). */
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
  // Await the async params object
  const { region, slug } = await params;

  const supabase = await getSupabaseServerClient();

  /* ----------------------------------------------------------------
     1. Fetch site basic data + province slug (for URL validation)
     ---------------------------------------------------------------- */
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
        province:provinces!sites_province_id_fkey ( slug )
      `
    )
    .eq("slug", slug)
    .maybeSingle();

  if (siteErr || !site) return notFound();

  // Supabase types this relation as an array: { slug: any }[]
  const provinceSlug: string | null =
    (site.province as { slug: string | null }[] | null)?.[0]?.slug ?? null;

  // Region MUST match the province slug or 404
  if (!provinceSlug || region !== provinceSlug) return notFound();

  /* ----------------------------------------------------------------
     2. Fetch cover from site_covers (canonical source)

        Priority:
        1) active cover (is_active = true)
        2) first by sort_order, then by created_at
  ---------------------------------------------------------------- */
  let coverRow: any = null;

  // 2.1 Active cover
  const { data: activeCover, error: activeErr } = await supabase
    .from("site_covers")
    .select(
      `
        id,
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
    .eq("is_active", true)
    .maybeSingle();

  if (!activeErr && activeCover) {
    coverRow = activeCover;
  }

  // 2.2 Fallback: first non-active row by sort_order / created_at
  if (!coverRow) {
    const { data: fallbackRows, error: fallbackErr } = await supabase
      .from("site_covers")
      .select(
        `
          id,
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
      .order("sort_order", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(1);

    if (fallbackErr) {
      console.warn("site_covers fallback fetch error:", fallbackErr);
    }

    coverRow = fallbackRows?.[0] ?? null;
  }

  /* ----------------------------------------------------------------
     3. Map site_covers → cover object for the client
  ---------------------------------------------------------------- */
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
    // cover is either a proper HeroCover object or undefined
    cover: coverForClient,
  };

  /* ----------------------------------------------------------------
     4. Render the client page with SSR site (incl. cover + blur)
  ---------------------------------------------------------------- */
  return <HeritageClient site={siteDataForClient} />;
}

/* ----------------------------- SEO ----------------------------- */
export async function generateMetadata({ params }: HeritagePageProps) {
  const { region, slug } = await params;

  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const canonical = `${base}/heritage/${region}/${slug}`;

  return {
    alternates: { canonical },
    openGraph: { url: canonical },
  };
}
