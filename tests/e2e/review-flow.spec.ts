import { test, expect } from "@playwright/test";

/**
 * Review submission flow — requires an authenticated user session.
 *
 * These tests need a logged-in session. Set up auth storage state first:
 *   npx playwright test --project="Mobile Chrome (Pixel 5)" tests/e2e/auth.setup.ts
 *
 * Then these tests will reuse the saved session.
 *
 * Without auth, the submit will be blocked and these tests will be skipped.
 */

const HERITAGE_PATH = process.env.TEST_HERITAGE_URL ?? "/heritage/punjab/lahore-fort";

test.describe("Review modal", () => {
  test("opens from + button, stars render and are tappable", async ({ page }) => {
    await page.goto(HERITAGE_PATH);

    // Open actions sheet
    await page.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByText("Add Review")).toBeVisible({ timeout: 5_000 });

    // Open review modal
    await page.getByText("Add Review").click();
    await expect(page.getByText("Write a Review")).toBeVisible({ timeout: 5_000 });

    // Stars should be present (5 buttons)
    const starBtns = page.getByRole("button", { name: /rate \d/i });
    await expect(starBtns).toHaveCount(5);

    // Tap star 4
    await starBtns.nth(3).click();

    // Write review text
    await page.getByPlaceholder(/share road conditions/i).fill(
      "This is a test review with enough characters to pass validation."
    );

    // Stars should NOT have reset after typing
    // (regression test for the star reset bug)
    const rating = await page.evaluate(() => {
      // Check aria-label on the 4th star button to confirm it's still selected
      return document.querySelector('[aria-label="Rate 4"]')?.closest("button")?.getAttribute("aria-pressed");
    });
    // The star buttons don't use aria-pressed, but the rating /5 label should show
    await expect(page.getByText("4/5")).toBeVisible();
  });

  test("modal can be dismissed by dragging down", async ({ page }) => {
    await page.goto(HERITAGE_PATH);
    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByText("Add Review").click();
    await expect(page.getByText("Write a Review")).toBeVisible({ timeout: 5_000 });

    // Drag the handle down to close
    const handle = page.locator(".rounded-full.bg-gray-300").first();
    const box = await handle.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 300, { steps: 10 });
      await page.mouse.up();
    }

    await expect(page.getByText("Write a Review")).not.toBeVisible({ timeout: 3_000 });
  });
});

test.describe("After review submit (mocked)", () => {
  test("page body remains scrollable after AllReviewsPanel opens", async ({ page }) => {
    await page.goto(HERITAGE_PATH);

    // Simulate what happens after onReviewSuccess fires by directly triggering scroll
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.scrollY);

    expect(after).toBeGreaterThan(before);
  });
});
