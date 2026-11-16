// Simple screenshot capture script using Playwright
import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    
    console.log('Waiting for page to load...');
    await page.waitForTimeout(3000);
    
    console.log('Taking home screenshot...');
    await page.screenshot({ path: '/opt/cursor/artifacts/opencode-home.png', fullPage: false });
    
    // Try to navigate to settings - look for settings button/link
    console.log('Looking for settings icon...');
    // Settings is usually a gear icon or button
    await page.click('[aria-label="Settings"], button[title="Settings"], svg[data-icon="settings"]').catch(() => {
      console.log('Settings button not found with selector, trying text...');
    });
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/opt/cursor/artifacts/opencode-settings.png', fullPage: false });
    
    // Try to find Agents tab
    console.log('Looking for Agents tab...');
    const agentsTab = await page.locator('text="Agents"').first();
    if (await agentsTab.isVisible()) {
      await agentsTab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/opt/cursor/artifacts/opencode-agents-list.png', fullPage: true });
      console.log('Captured agents list screenshot');
      
      // Try to click an Edit button
      const editButton = await page.locator('button:has-text("Edit")').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '/opt/cursor/artifacts/opencode-agents-edit.png', fullPage: false });
        console.log('Captured edit dialog screenshot');
      }
    }
    
    console.log('Screenshots saved to /opt/cursor/artifacts/');
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/opt/cursor/artifacts/opencode-error.png' });
  } finally {
    await browser.close();
  }
})();
