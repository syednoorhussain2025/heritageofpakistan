export async function hardDeleteReview(reviewId: string): Promise<void> {
  const res = await fetch("/api/reviews/hard-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || "Failed to delete review");
  }
}
