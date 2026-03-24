import { test, expect } from "@playwright/test";

/**
 * Heritage detail page — smoke tests
 *
 * These tests verify the page loads correctly and key UI elements are present.
 * Set TEST_HERITAGE_URL in your environment to point at a real site slug, e.g.:
 *   TEST_HERITAGE_URL=/heritage/punjab/lahore-fort
 */

const HERITAGE_PATH = process.env.TEST_HERITAGE_URL ?? "/heritage/punjab/lahore-fort";

test.describe("Heritage detail page", () => {
  test("page loads and shows cover image", async ({ page }) => {
    await page.goto(HERITAGE_PATH);
    // Wait for the hero image or slideshow
    await expect(page.locator("img").first()).toBeVisible({ timeout: 10_000 });
  });

  test("mobile header back button is visible", async ({ page }) => {
    await page.goto(HERITAGE_PATH);
    const backBtn = page.getByRole("button", { name: /go back/i });
    await expect(backBtn).toBeVisible({ timeout: 8_000 });
  });

  test("mobile + button opens actions sheet", async ({ page }) => {
    await page.goto(HERITAGE_PATH);
    const plusBtn = page.getByRole("button", { name: /more actions/i });
    await plusBtn.click();
    // Actions sheet should slide in with at least one action visible
    await expect(page.getByText("Add to Trip")).toBeVisible({ timeout: 5_000 });
    // Add Review should be visible (we're on the detail page, not SiteBottomSheet)
    await expect(page.getByText("Add Review")).toBeVisible();
  });

  test("Traveler Reviews section shows carousel or empty state", async ({ page }) => {
    await page.goto(HERITAGE_PATH);
    // Scroll down to reviews
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1000);
    // Either reviews are shown or the empty state
    const hasReviews = await page.locator("article").count();
    const hasEmpty = await page.getByText("No reviews yet.").isVisible().catch(() => false);
    expect(hasReviews > 0 || hasEmpty).toBeTruthy();
  });

  test("Show All Reviews button opens panel", async ({ page }) => {
    await page.goto(HERITAGE_PATH);
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1000);

    const showAllBtn = page.getByRole("button", { name: /show all reviews/i });
    if (await showAllBtn.isVisible()) {
      await showAllBtn.click();
      // AllReviewsPanel should slide in
      await expect(page.getByText("All Reviews")).toBeVisible({ timeout: 5_000 });
      // Back button should close it
      await page.getByRole("button", { name: /back/i }).click();
      await expect(page.getByText("All Reviews")).not.toBeVisible({ timeout: 3_000 });
    } else {
      // Not enough reviews to show button — skip
      test.skip();
    }
  });

  test("page body is scrollable (not frozen)", async ({ page }) => {
    await page.goto(HERITAGE_PATH);
    await page.waitForTimeout(500);

    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.scrollY);

    expect(after).toBeGreaterThan(before);
  });
});
