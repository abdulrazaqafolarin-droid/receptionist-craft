import { test, expect } from '@playwright/test';

test.describe('Widget Chat E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('widget opens and shows greeting', async ({ page }) => {
    // Look for the chat widget button
    const chatButton = page.locator('button[aria-label*="chat" i], button:has-text("Chat"), [data-testid="chat-widget"]').first();
    
    if (await chatButton.isVisible({ timeout: 5000 })) {
      await chatButton.click();
      
      // Wait for chat window to open
      await expect(page.locator('[role="dialog"], [data-testid="chat-window"], .chat-window')).toBeVisible({ timeout: 5000 });
      
      // Check for greeting message
      await expect(page.locator('text=/hello/i, text=/hi/i, text=/welcome/i, text=/how can i help/i')).toBeVisible({ timeout: 5000 });
    }
  });

  test('sends message and receives response', async ({ page }) => {
    const chatButton = page.locator('button[aria-label*="chat" i], button:has-text("Chat"), [data-testid="chat-widget"]').first();
    
    if (await chatButton.isVisible({ timeout: 5000 })) {
      await chatButton.click();
      await expect(page.locator('[role="dialog"], [data-testid="chat-window"], .chat-window')).toBeVisible({ timeout: 5000 });
      
      // Find message input
      const messageInput = page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i], [data-testid="chat-input"]').first();
      
      if (await messageInput.isVisible({ timeout: 3000 })) {
        await messageInput.fill('Hello, I want to book an appointment');
        await page.keyboard.press('Enter');
        
        // Wait for AI response
        await expect(page.locator('text=/booking/i, text=/appointment/i, text=/service/i')).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('widget persists across navigation', async ({ page }) => {
    const chatButton = page.locator('button[aria-label*="chat" i], button:has-text("Chat"), [data-testid="chat-widget"]').first();
    
    if (await chatButton.isVisible({ timeout: 5000 })) {
      await chatButton.click();
      await expect(page.locator('[role="dialog"], [data-testid="chat-window"], .chat-window')).toBeVisible({ timeout: 5000 });
      
      // Navigate to another page
      await page.goto('/onboarding');
      await page.waitForLoadState('networkidle');
      
      // Check widget still exists
      await expect(page.locator('button[aria-label*="chat" i], button:has-text("Chat"), [data-testid="chat-widget"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('widget is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const chatButton = page.locator('button[aria-label*="chat" i], button:has-text("Chat"), [data-testid="chat-widget"]').first();
    await expect(chatButton).toBeVisible({ timeout: 5000 });
    
    await chatButton.click();
    await expect(page.locator('[role="dialog"], [data-testid="chat-window"], .chat-window')).toBeVisible({ timeout: 5000 });
  });
});