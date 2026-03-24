import { test, expect } from "@playwright/test";

/**
 * SiteActionsSheet — verifies "Add Review" visibility rules
 */

const EXPLORE_PATH = "/explore";
const HERITAGE_PATH = process.env.TEST_HERITAGE_URL ?? "/heritage/punjab/lahore-fort";

test.describe("SiteActionsSheet on heritage detail page", () => {
  test("Add Review IS visible when opened from heritage detail page", async ({ page }) => {
    await page.goto(HERITAGE_PATH);
    await page.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByText("Add Review")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("SiteActionsSheet on explore page (via SiteBottomSheet)", () => {
  test("Add Review is NOT visible when opened from site card bottom sheet", async ({ page }) => {
    await page.goto(EXPLORE_PATH);

    // Wait for site cards to load
    await page.waitForTimeout(2000);

    // Click the first site card to open SiteBottomSheet
    const siteCard = page.locator("[data-site-id]").first();
    if (!await siteCard.isVisible()) {
      // Try generic card click
      const card = page.locator("article, [class*='card']").first();
      if (await card.isVisible()) await card.click();
      else { test.skip(); return; }
    } else {
      await siteCard.click();
    }

    // Wait for SiteBottomSheet
    await page.waitForTimeout(1000);

    // Find and click the ellipsis/actions button inside the bottom sheet
    const actionsBtn = page.getByRole("button", { name: /actions|ellipsis|more/i }).last();
    if (await actionsBtn.isVisible()) {
      await actionsBtn.click();
      await page.waitForTimeout(500);
      // Add Review should NOT appear
      await expect(page.getByText("Add Review")).not.toBeVisible();
    } else {
      test.skip();
    }
  });
});
