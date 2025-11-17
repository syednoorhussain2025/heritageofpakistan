// src/app/heritage/[region]/[slug]/page.tsx
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import HeritageClient from "./HeritageClient";

type Params = { region: string; slug: string };

type HeritagePageProps = {
  // Next.js 15 typing
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

type NeighborLink = {
  slug: string;
  province_slug: string | null;
  title: string;
};

export default async function Page({ params }: HeritagePageProps) {
  // Await the async params object (Next 15)
  const { region, slug } = await params;

  const supabase = await getSupabaseServerClient();

  /* ----------------------------------------------------------------
     1. Fetch site basic data + province slug (for URL validation)
  ----------------------------------------------------------------- */
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

  // Support both object and array shapes for the relation
  const provinceRel: any = (site as any).province;
  const provinceSlug: string | null = Array.isArray(provinceRel)
    ? provinceRel[0]?.slug ?? null
    : provinceRel?.slug ?? null;

  // Region MUST match the province slug or 404
  if (!provinceSlug || region !== provinceSlug) return notFound();

  /* ----------------------------------------------------------------
     2. Fetch cover from site_covers (canonical source)

        Priority:
        1) active cover (is_active = true)
        2) first by sort_order, then by created_at
  ----------------------------------------------------------------- */
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
  ----------------------------------------------------------------- */
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

  /* ----------------------------------------------------------------
     4. Compute previous / next neighbours within same province
        (ordered by title, only published + not deleted)
  ----------------------------------------------------------------- */
  let prevNeighbor: NeighborLink | null = null;
  let nextNeighbor: NeighborLink | null = null;

  if (site.province_id != null) {
    const { data: siblings, error: siblingsErr } = await supabase
      .from("sites")
      .select(`id, slug, title`)
      .eq("province_id", site.province_id)
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("title", { ascending: true });

    if (!siblingsErr && siblings && siblings.length) {
      const idx = siblings.findIndex((s) => s.id === site.id);

      if (idx > 0) {
        const prev = siblings[idx - 1];
        prevNeighbor = {
          slug: prev.slug,
          province_slug: provinceSlug,
          title: prev.title,
        };
      }

      if (idx >= 0 && idx < siblings.length - 1) {
        const next = siblings[idx + 1];
        nextNeighbor = {
          slug: next.slug,
          province_slug: provinceSlug,
          title: next.title,
        };
      }
    }
  }

  const neighborsForClient = {
    prev: prevNeighbor,
    next: nextNeighbor,
  };

  const siteDataForClient = {
    ...site,
    province_slug: provinceSlug,
    cover: coverForClient ?? null,
  };

  /* ----------------------------------------------------------------
     5. Render the client page with SSR site (incl. cover + blur)
        + neighbours for swipe navigation
  ----------------------------------------------------------------- */
  return <HeritageClient site={siteDataForClient} neighbors={neighborsForClient} />;
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
