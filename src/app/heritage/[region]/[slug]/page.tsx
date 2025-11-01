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
        // In RSC these are effectively no-ops, which is fine for reads.
        set: () => {},
        remove: () => {},
      },
    }
  );
}

export default async function Page({ params }: { params: Params }) {
  const { region, slug } = params;

  const supabase = getSupabaseServerClient();

  // Fetch site and its province slug for strict validation against URL.
  const { data: site, error } = await supabase
    .from("sites")
    .select(
      `
      id,
      slug,
      title,
      province:provinces!sites_province_id_fkey (
        slug
      )
    `
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    // Surface 404 rather than crashing on read errors for a public page.
    return notFound();
  }
  if (!site) return notFound();

  const provinceSlug: string | null = site.province?.slug ?? null;

  // No backward compatibility: region must match DB, else 404.
  if (!provinceSlug || region !== provinceSlug) return notFound();

  // Render the client page. All data fetching remains in your client hook.
  return <HeritageClient />;
}

/* ----------------------------- SEO (optional) ----------------------------- */
export async function generateMetadata({ params }: { params: Params }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const canonical = `${base}/heritage/${params.region}/${params.slug}`;
  return {
    alternates: { canonical },
    openGraph: { url: canonical },
  };
}

/* ------------------------ Static params (optional) ------------------------ */
/* If you pre-render site pages at build time, uncomment and implement:

export async function generateStaticParams(): Promise<Params[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("sites")
    .select(`
      slug,
      province:provinces!sites_province_id_fkey ( slug )
    `)
    .eq("is_published", true);

  if (error || !data) return [];

  return data
    .filter((row) => row.province?.slug)
    .map((row) => ({
      region: row.province!.slug as string,
      slug: row.slug as string,
    }));
}
*/
