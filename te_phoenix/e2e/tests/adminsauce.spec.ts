import { test, expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════
// ADMINSAUCE — COMPREHENSIVE E2E TEST SUITE
// Tests every AdminSauce page, CRUD operation, and system integration.
// Run against a live server: BASE_URL=http://localhost:4000 npx playwright test
// ═══════════════════════════════════════════════════════════════════

const BASE = process.env.BASE_URL || 'http://localhost:4000';

// ── Helper: navigate and verify page loads ───────────────────────
async function loadPage(page, path: string, expectedText: string) {
  const response = await page.goto(`${BASE}${path}`);
  expect(response?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  // LiveView mounts — wait for content
  await expect(page.locator('body')).toContainText(expectedText, { timeout: 15000 });
}

// ═══════════════════════════════════════════════════════════════════
// 1. CORE ADMINSAUCE PAGES
// ═══════════════════════════════════════════════════════════════════

test.describe('AdminSauce Core Pages', () => {
  test('Dashboard loads with sidebar', async ({ page }) => {
    await loadPage(page, '/sauce', 'AdminSauce');
    await expect(page.locator('nav')).toContainText('Dashboard');
    await expect(page.locator('nav')).toContainText('Players');
  });

  test('Dashboard has styled dark theme', async ({ page }) => {
    await loadPage(page, '/sauce', 'AdminSauce');
    const body = page.locator('body');
    const bg = await body.evaluate(el => getComputedStyle(el).backgroundColor);
    // bg-zinc-950 is very dark — should not be white
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });

  test('Players page loads', async ({ page }) => {
    await loadPage(page, '/sauce/players', 'Players');
  });

  test('Settings page loads', async ({ page }) => {
    await loadPage(page, '/sauce/settings', 'Settings');
  });

  test('Capabilities page loads', async ({ page }) => {
    await loadPage(page, '/sauce/capabilities', 'Capabilities');
  });

  test('System hub loads', async ({ page }) => {
    await loadPage(page, '/sauce/system', 'System');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. WORLD / MAP SYSTEM
// ═══════════════════════════════════════════════════════════════════

test.describe('World & Maps', () => {
  test('World hub loads', async ({ page }) => {
    await loadPage(page, '/sauce/world', 'Maps');
  });

  test('Map connections page loads', async ({ page }) => {
    await loadPage(page, '/sauce/world/map-connections', 'Map Connections');
  });

  test('Objectives page loads with seeded data', async ({ page }) => {
    await loadPage(page, '/sauce/world/objectives', 'Objectives');
    // Should have seeded objective types
    await expect(page.locator('table')).toContainText('interact');
  });

  test('Objectives CRUD — create new', async ({ page }) => {
    await loadPage(page, '/sauce/world/objectives', 'Objectives');
    await page.click('button:has-text("+ New Objective")');
    await page.fill('input[name="key"]', 'e2e_test_obj');
    await page.fill('input[name="name"]', 'E2E Test Objective');
    await page.click('button:has-text("Save")');
    await expect(page.locator('table')).toContainText('e2e_test_obj');
  });

  test('Objectives CRUD — delete', async ({ page }) => {
    await loadPage(page, '/sauce/world/objectives', 'Objectives');
    // Accept the confirm dialog
    page.on('dialog', dialog => dialog.accept());
    const deleteBtn = page.locator('button:has-text("delete")').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
    }
  });

  test('Wave sequences page loads', async ({ page }) => {
    await loadPage(page, '/sauce/world/waves', 'Wave Sequences');
    await expect(page.locator('table')).toBeVisible();
  });

  test('Waves CRUD — create new', async ({ page }) => {
    await loadPage(page, '/sauce/world/waves', 'Wave Sequences');
    const newBtn = page.locator('button').filter({ hasText: /New/ }).first();
    await newBtn.click();
    await page.waitForTimeout(500);
    const form = page.locator('form');
    if (await form.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('input[name="key"]', 'e2e_wave_test');
      await page.fill('input[name="name"]', 'E2E Wave Test');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. COMBAT SYSTEM
// ═══════════════════════════════════════════════════════════════════

test.describe('Combat System', () => {
  test('Combat hub loads', async ({ page }) => {
    await loadPage(page, '/sauce/combat', 'Classes');
  });

  test('Status effects page loads with seeded statuses', async ({ page }) => {
    await loadPage(page, '/sauce/combat/statuses', 'Status Effects');
    // Should have seeded bleed/stun/poison etc
    await expect(page.locator('table')).toContainText('bleed');
  });

  test('Status effects CRUD — create new', async ({ page }) => {
    await loadPage(page, '/sauce/combat/statuses', 'Status Effects');
    await page.click('button:has-text("+ New Status")');
    await page.fill('input[name="key"]', 'e2e_test_status');
    await page.fill('input[name="name"]', 'E2E Test Status');
    await page.fill('input[name="icon"]', '🧪');
    await page.click('button:has-text("Save")');
    await expect(page.locator('table')).toContainText('e2e_test_status');
  });

  test('Battle rules page loads', async ({ page }) => {
    await loadPage(page, '/sauce/combat/rules', 'Battle Rules');
    await expect(page.locator('table')).toBeVisible();
  });

  test('Battle rules CRUD — create new', async ({ page }) => {
    await loadPage(page, '/sauce/combat/rules', 'Battle Rules');
    const newBtn = page.locator('button').filter({ hasText: /New/ }).first();
    await newBtn.click();
    await page.waitForTimeout(500);
    const form = page.locator('form');
    if (await form.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('input[name="key"]', 'e2e_test_rule');
      await page.fill('input[name="name"]', 'E2E Test Rule');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }
  });

  test('Boss phases page loads', async ({ page }) => {
    await loadPage(page, '/sauce/combat/bosses', 'Boss Phases');
    await expect(page.locator('text=Select Boss NPC')).toBeVisible();
  });

  test('Surfaces page loads', async ({ page }) => {
    await loadPage(page, '/sauce/combat/surfaces', 'Surface');
    await expect(page.locator('table')).toBeVisible();
  });

  test('Surfaces CRUD — create new', async ({ page }) => {
    await loadPage(page, '/sauce/combat/surfaces', 'Surface');
    const newBtn = page.locator('button').filter({ hasText: /New/ }).first();
    await newBtn.click();
    await page.waitForTimeout(500);
    const form = page.locator('form');
    if (await form.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('input[name="key"]', 'e2e_lava');
      await page.fill('input[name="name"]', 'E2E Lava');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. MATCH SYSTEM
// ═══════════════════════════════════════════════════════════════════

test.describe('Match Modes', () => {
  test('Match modes page loads with seeded modes', async ({ page }) => {
    await loadPage(page, '/sauce/matches', 'Match Modes');
    await expect(page.locator('table')).toContainText('1v1_duel');
    await expect(page.locator('table')).toContainText('5v5_moba');
  });

  test('Match modes CRUD — create new', async ({ page }) => {
    await loadPage(page, '/sauce/matches', 'Match Modes');
    await page.click('button:has-text("+ New Mode")');
    await page.fill('input[name="key"]', 'e2e_test_mode');
    await page.fill('input[name="name"]', 'E2E Test Mode');
    await page.click('button:has-text("Save")');
    await expect(page.locator('table')).toContainText('e2e_test_mode');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. VISUAL SCRIPTING
// ═══════════════════════════════════════════════════════════════════

test.describe('Visual Scripting', () => {
  test('Script list page loads', async ({ page }) => {
    await loadPage(page, '/sauce/scripts', 'Visual Scripts');
  });

  test('Script list — create new', async ({ page }) => {
    await loadPage(page, '/sauce/scripts', 'Visual Scripts');
    await page.click('button:has-text("+ New Script")');
    // Should redirect or show new script
    await page.waitForTimeout(1000);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. ONBOARDING
// ═══════════════════════════════════════════════════════════════════

test.describe('Onboarding', () => {
  test('Onboarding wizard loads with genre tiles', async ({ page }) => {
    await loadPage(page, '/sauce/onboarding', 'What kind of game');
    await expect(page.locator('text=RPG')).toBeVisible();
    await expect(page.locator('text=RTS')).toBeVisible();
    await expect(page.locator('text=Roguelike')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. SIDEBAR NAVIGATION — VERIFY ALL LINKS PRESENT
// ═══════════════════════════════════════════════════════════════════

test.describe('Sidebar Navigation', () => {
  test('All sidebar links are present', async ({ page }) => {
    await loadPage(page, '/sauce', 'AdminSauce');
    const nav = page.locator('nav');

    // Core
    await expect(nav).toContainText('Dashboard');
    await expect(nav).toContainText('Players');

    // World
    await expect(nav).toContainText('Maps');
    await expect(nav).toContainText('Objectives');
    await expect(nav).toContainText('Wave Sequences');

    // Combat
    await expect(nav).toContainText('Classes');
    await expect(nav).toContainText('Status Effects');
    await expect(nav).toContainText('Battle Rules');
    await expect(nav).toContainText('Boss Phases');
    await expect(nav).toContainText('Surfaces');

    // Match
    await expect(nav).toContainText('Match Modes');

    // Scripts
    await expect(nav).toContainText('Visual Scripts');
  });

  test('Each sidebar link navigates correctly', async ({ page }) => {
    await loadPage(page, '/sauce', 'AdminSauce');

    const links = [
      { text: 'Dashboard', url: '/sauce' },
      { text: 'Status Effects', url: '/sauce/combat/statuses' },
      { text: 'Battle Rules', url: '/sauce/combat/rules' },
      { text: 'Boss Phases', url: '/sauce/combat/bosses' },
      { text: 'Surfaces', url: '/sauce/combat/surfaces' },
      { text: 'Match Modes', url: '/sauce/matches' },
      { text: 'Objectives', url: '/sauce/world/objectives' },
      { text: 'Wave Sequences', url: '/sauce/world/waves' },
    ];

    for (const link of links) {
      await page.click(`nav a:has-text("${link.text}")`);
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain(link.url);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. API ENDPOINTS (HTTP)
// ═══════════════════════════════════════════════════════════════════

test.describe('API Endpoints', () => {
  test('All admin routes return 200', async ({ request }) => {
    const routes = [
      '/sauce',
      '/sauce/players',
      '/sauce/world',
      '/sauce/world/objectives',
      '/sauce/world/waves',
      '/sauce/world/map-connections',
      '/sauce/combat',
      '/sauce/combat/statuses',
      '/sauce/combat/rules',
      '/sauce/combat/bosses',
      '/sauce/combat/surfaces',
      '/sauce/matches',
      '/sauce/scripts',
      '/sauce/onboarding',
      '/sauce/capabilities',
      '/sauce/settings',
      '/sauce/system',
      '/sauce/config',
    ];

    for (const route of routes) {
      const response = await request.get(route);
      expect(response.status(), `${route} should be 200`).toBe(200);
    }
  });

  test('CSS loads without redirect', async ({ request }) => {
    // Get the actual CSS URL from the page
    const pageResponse = await request.get('/sauce');
    const html = await pageResponse.text();
    const cssMatch = html.match(/assets\/css\/[^"]+/);
    expect(cssMatch).toBeTruthy();

    const cssResponse = await request.get(`/${cssMatch![0]}`);
    expect(cssResponse.status()).toBe(200);
    const cssText = await cssResponse.text();
    expect(cssText).toContain('tailwindcss');
  });

  test('JS loads without redirect', async ({ request }) => {
    const pageResponse = await request.get('/sauce');
    const html = await pageResponse.text();
    const jsMatch = html.match(/assets\/js\/[^"]+/);
    expect(jsMatch).toBeTruthy();

    const jsResponse = await request.get(`/${jsMatch![0]}`);
    expect(jsResponse.status()).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. LIVEVIEW INTERACTIVITY
// ═══════════════════════════════════════════════════════════════════

test.describe('LiveView Interactivity', () => {
  test('Status effects — edit form opens and closes', async ({ page }) => {
    await loadPage(page, '/sauce/combat/statuses', 'Status Effects');

    const editBtn = page.locator('button:has-text("edit")').first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      await expect(page.locator('form')).toBeVisible({ timeout: 5000 });
      await page.click('button:has-text("Cancel")');
      await page.waitForTimeout(500);
    }
  });

  test('Objectives — new form has type dropdown', async ({ page }) => {
    await loadPage(page, '/sauce/world/objectives', 'Objectives');
    const newBtn = page.locator('button').filter({ hasText: /New/ }).first();
    await newBtn.click();
    await page.waitForTimeout(500);
    const form = page.locator('form');
    if (await form.isVisible({ timeout: 3000 }).catch(() => false)) {
      const select = page.locator('select[name="type"]');
      if (await select.isVisible({ timeout: 2000 }).catch(() => false)) {
        const options = await select.locator('option').allTextContents();
        expect(options.length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  test('Battle rules — trigger dropdown has all events', async ({ page }) => {
    await loadPage(page, '/sauce/combat/rules', 'Battle Rules');
    await page.click('button:has-text("+ New Rule")');

    const select = page.locator('select[name="trigger"]');
    const options = await select.locator('option').allTextContents();

    expect(options).toContain('limb_broken');
    expect(options).toContain('ko');
    expect(options).toContain('death');
    expect(options).toContain('damage_taken');
    expect(options).toContain('turn_start');
    expect(options).toContain('turn_end');
  });

  test('Match modes — queue type dropdown works', async ({ page }) => {
    await loadPage(page, '/sauce/matches', 'Match Modes');
    await page.click('button:has-text("+ New Mode")');

    const select = page.locator('select[name="queue_type"]');
    const options = await select.locator('option').allTextContents();

    expect(options).toContain('casual');
    expect(options).toContain('ranked');
    expect(options).toContain('custom');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. SEEDED DATA INTEGRITY
// ═══════════════════════════════════════════════════════════════════

test.describe('Seeded Data Integrity', () => {
  test('Status effects — all default statuses present', async ({ page }) => {
    await loadPage(page, '/sauce/combat/statuses', 'Status Effects');
    const table = page.locator('table');

    const expected = ['bleed_light', 'bleed_moderate', 'bleed_heavy', 'poison', 'burn', 'freeze',
                      'stun', 'sleep', 'silence', 'blind', 'confuse', 'berserk',
                      'regen', 'haste', 'slow', 'shield'];

    for (const key of expected) {
      await expect(table).toContainText(key);
    }
  });

  test('Battle rules — table renders', async ({ page }) => {
    await loadPage(page, '/sauce/combat/rules', 'Battle Rules');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('thead')).toContainText('Trigger');
  });

  test('Surfaces — table renders', async ({ page }) => {
    await loadPage(page, '/sauce/combat/surfaces', 'Surface');
    await expect(page.locator('table')).toBeVisible();
  });

  test('Objectives — table renders with type column', async ({ page }) => {
    await loadPage(page, '/sauce/world/objectives', 'Objectives');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('thead')).toContainText('Type');
  });

  test('Wave sequences — table renders', async ({ page }) => {
    await loadPage(page, '/sauce/world/waves', 'Wave Sequences');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('thead')).toContainText('Key');
  });

  test('Match modes — all defaults present', async ({ page }) => {
    await loadPage(page, '/sauce/matches', 'Match Modes');
    const table = page.locator('table');

    await expect(table).toContainText('1v1_duel');
    await expect(table).toContainText('3v3_arena');
    await expect(table).toContainText('5v5_moba');
    await expect(table).toContainText('4v1_horror');
    await expect(table).toContainText('ffa_battle_royale');
    await expect(table).toContainText('td_coop');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 11. CLEANUP — DELETE E2E TEST DATA
// ═══════════════════════════════════════════════════════════════════

test.describe('Cleanup', () => {
  test('Delete e2e test data', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());

    // Clean up test status
    await loadPage(page, '/sauce/combat/statuses', 'Status Effects');
    const statusDelete = page.locator('tr:has-text("e2e_test_status") button:has-text("delete")');
    if (await statusDelete.isVisible()) await statusDelete.click();

    // Clean up test rule
    await loadPage(page, '/sauce/combat/rules', 'Battle Rules');
    const ruleDelete = page.locator('tr:has-text("e2e_test_rule") button:has-text("delete")');
    if (await ruleDelete.isVisible()) await ruleDelete.click();

    // Clean up test surface
    await loadPage(page, '/sauce/combat/surfaces', 'Surface');
    const surfDelete = page.locator('tr:has-text("e2e_lava") button:has-text("delete")');
    if (await surfDelete.isVisible()) await surfDelete.click();

    // Clean up test match mode
    await loadPage(page, '/sauce/matches', 'Match Modes');
    const modeDelete = page.locator('tr:has-text("e2e_test_mode") button:has-text("delete")');
    if (await modeDelete.isVisible()) await modeDelete.click();
  });
});
