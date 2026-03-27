import { NextRequest, NextResponse } from "next/server";
import { fetchDiscoverPhotos } from "@/lib/discover-actions";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "0", 10);
  const seed = parseFloat(searchParams.get("seed") ?? "0.5");

  const photos = await fetchDiscoverPhotos(page, seed);
  return NextResponse.json(photos);
}
