// app/heritage/[region]/[slug]/page.tsx
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import HeritageClient from "./HeritageClient";

type Params = { region: string; slug: string };

/** Build a Supabase server client bound to request cookies. */
function getSupabaseServerClient() {
  const cookieStore = cookies();
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

export default async function Page({ params }: { params: Params }) {
  const { region, slug } = params;

  const supabase = getSupabaseServerClient();

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

  const provinceSlug: string | null = site.province?.slug ?? null;

  // Region MUST match the province slug or 404
  if (!provinceSlug || region !== provinceSlug) return notFound();

  /* ----------------------------------------------------------------
     2. Fetch cover image from site_images (the new canonical source)
  ---------------------------------------------------------------- */
  const { data: cover, error: coverErr } = await supabase
    .from("site_images")
    .select(
      `
      id,
      storage_path,
      width,
      height,
      blurhash,
      blur_url,      -- If you generated tiny blur data URLs
      caption,
      credit
    `
    )
    .eq("site_id", site.id)
    .eq("is_cover", true)
    .limit(1)
    .maybeSingle();

  if (coverErr) {
    // Even if cover can't be fetched, we still show page (with fallback)
    console.warn("Cover fetch error:", coverErr);
  }

  /* ----------------------------------------------------------------
     3. Construct the final site payload for HeritageClient
  ---------------------------------------------------------------- */
  const publicUrl = (path: string | null) =>
    path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-images/${path}`
      : null;

  const siteDataForClient = {
    ...site,
    province_slug: provinceSlug,
    cover: cover
      ? {
          url: publicUrl(cover.storage_path),
          width: cover.width,
          height: cover.height,
          blurhash: cover.blurhash,
          blurDataURL: cover.blur_url ?? null,
          caption: cover.caption ?? null,
          credit: cover.credit ?? null,
        }
      : null,
  };

  /* ----------------------------------------------------------------
     4. Render the client page with full SSR data provided
  ---------------------------------------------------------------- */
  return <HeritageClient site={siteDataForClient} />;
}

/* ----------------------------- SEO ----------------------------- */
export async function generateMetadata({ params }: { params: Params }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const canonical = `${base}/heritage/${params.region}/${params.slug}`;
  return {
    alternates: { canonical },
    openGraph: { url: canonical },
  };
}
