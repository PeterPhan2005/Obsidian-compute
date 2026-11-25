// Playwright includes page.goto URLs in report steps. Pass the destination
// as evaluation data so a receipt or reset token stays out of the step text.
export async function navigateWithToken(page, destination) {
  await page.evaluate((path) => {
    setTimeout(() => window.location.assign(path), 0);
  }, destination);
}
