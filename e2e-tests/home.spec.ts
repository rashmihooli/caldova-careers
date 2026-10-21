import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Derive the expected posting count from the job content collection so this
// assertion stays correct as roles are added or removed.
const jobsDir = fileURLToPath(new URL('../src/content/jobs', import.meta.url));
const expectedRoleCount = readdirSync(jobsDir).filter((f) => f.endsWith('.md')).length;

/** Card metadata used to derive expected results independently of filter helpers. */
interface ListedRole {
  slug: string;
  department: string;
  location: string;
}

/**
 * Capture all rendered roles, including hidden cards, in their original DOM order.
 *
 * @param page - The loaded home page.
 * @returns Role IDs and exact facet labels for browser-test expectations.
 * @throws If a role card lacks the metadata needed to calculate expectations.
 */
async function getListedRoles(page: Page): Promise<ListedRole[]> {
  return page.getByTestId('role-card').evaluateAll((cards) => cards.map((card) => {
    const slug = card.getAttribute('data-job-id');
    const department = card.getAttribute('data-department');
    const location = card.querySelector('[data-testid="role-location"]')?.textContent?.trim();
    if (!slug || !department || !location) {
      throw new Error('Role card is missing expected metadata.');
    }
    return { slug, department, location };
  }));
}

/**
 * Assert visible results in order without counting unmatched cards kept in the DOM.
 *
 * @param page - The loaded home page after a filter interaction.
 * @param roles - Expected visible roles in their original display order.
 * @returns A promise that resolves when card and result-count assertions pass.
 */
async function expectVisibleRoles(page: Page, roles: ListedRole[]): Promise<void> {
  const visibleCards = page.locator('[data-testid="role-card"]:visible');
  await expect(visibleCards).toHaveCount(roles.length);
  for (const [index, role] of roles.entries()) {
    await expect(visibleCards.nth(index)).toHaveAttribute('data-job-id', role.slug);
  }
  await expect(page.getByTestId('roles-count'))
    .toHaveText(`Showing ${roles.length} ${roles.length === 1 ? 'role' : 'roles'}`);
}

test.describe('Open roles listing', () => {
    test('shows the roles grid with all postings', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Open roles' })).toBeVisible();

        const grid = page.getByTestId('roles-grid');
        await expect(grid).toBeVisible();
        await expect(page.getByTestId('role-card')).toHaveCount(expectedRoleCount);
        await expect(grid.getByTestId('role-location')).toHaveCount(expectedRoleCount);
    });

    test('defaults to all roles with fixed, unique alphabetical filter options', async ({ page }) => {
      await page.goto('/');
      const roles = await getListedRoles(page);
      const department = page.getByRole('combobox', { name: 'Department', exact: true });
      const location = page.getByRole('combobox', { name: 'Location', exact: true });
      const departments = [...new Set(roles.map((role) => role.department))]
        .sort((a, b) => a.localeCompare(b, 'en'));
      const locations = [...new Set(roles.map((role) => role.location))]
        .sort((a, b) => a.localeCompare(b, 'en'));

      await expect(department).toHaveValue('');
      await expect(location).toHaveValue('');
      await expect(department.locator('option')).toHaveText(['All departments', ...departments]);
      await expect(location.locator('option')).toHaveText(['All locations', ...locations]);
      await expectVisibleRoles(page, roles);

      await department.selectOption('Technology');
      await expect(location.locator('option')).toHaveText(['All locations', ...locations]);
      await location.selectOption('Remote (US & Canada)');
      await expect(department.locator('option')).toHaveText(['All departments', ...departments]);
    });

    test('filters by department and resets without changing role order or URL', async ({ page }) => {
      await page.goto('/');
      const roles = await getListedRoles(page);
      const initialUrl = page.url();
      const department = page.getByTestId('department-filter');
      await department.selectOption('Finance');
      await expectVisibleRoles(page, roles.filter((role) => role.department === 'Finance'));
      await expect(page.getByTestId('location-filter')).toHaveValue('');
      await expect(page).toHaveURL(initialUrl);

      await page.getByRole('button', { name: 'Reset filters' }).click();
      await expect(department).toHaveValue('');
      await expect(page.getByTestId('location-filter')).toHaveValue('');
      await expectVisibleRoles(page, roles);
    });

    for (const selectedLocation of ['Woodinville, WA, USA', 'Remote (US & Canada)']) {
      test(`filters by exact location: ${selectedLocation}`, async ({ page }) => {
        await page.goto('/');
        const roles = await getListedRoles(page);
        await page.getByTestId('location-filter').selectOption(selectedLocation);
        await expectVisibleRoles(page, roles.filter((role) => role.location === selectedLocation));
        await expect(page.getByTestId('department-filter')).toHaveValue('');
        await expect(page.getByTestId('empty-state')).toBeHidden();
      });
    }

    test('combines selections with AND and can clear either facet independently', async ({ page }) => {
      await page.goto('/');
      const roles = await getListedRoles(page);
      const department = page.getByTestId('department-filter');
      const location = page.getByTestId('location-filter');

      await test.step('combine department and location', async () => {
        await department.selectOption('Finance');
        await location.selectOption('Woodinville, WA, USA');
        await expectVisibleRoles(page, roles.filter((role) =>
          role.department === 'Finance' && role.location === 'Woodinville, WA, USA'));
      });
      await test.step('change location without clearing department', async () => {
        await location.selectOption('Helsinki, Finland');
        await expect(department).toHaveValue('Finance');
        await expectVisibleRoles(page, roles.filter((role) =>
          role.department === 'Finance' && role.location === 'Helsinki, Finland'));
      });
      await test.step('clear department without clearing location', async () => {
        await department.selectOption('');
        await expect(location).toHaveValue('Helsinki, Finland');
        await expectVisibleRoles(page, roles.filter((role) => role.location === 'Helsinki, Finland'));
      });
      await test.step('clear location without clearing department', async () => {
        await department.selectOption('Finance');
        await location.selectOption('');
        await expect(department).toHaveValue('Finance');
        await expectVisibleRoles(page, roles.filter((role) => role.department === 'Finance'));
      });
    });

    test('shows an accessible no-match state and resets to the full listing', async ({ page }) => {
      await page.goto('/');
      const roles = await getListedRoles(page);
      const department = page.getByTestId('department-filter');
      const location = page.getByTestId('location-filter');
      const reset = page.getByRole('button', { name: 'Reset filters' });
      await department.selectOption('Technology');
      await location.focus();
      await location.selectOption('Woodinville, WA, USA');

      await expectVisibleRoles(page, []);
      await expect(location).toBeFocused();
      await expect(page.getByRole('status')).toHaveText('Showing 0 roles');
      await expect(page.getByTestId('roles-grid')).toBeHidden();
      await expect(page.getByTestId('empty-state-text'))
        .toHaveText('No roles match these filters. Try another selection or reset the filters.');
      await expect(page.getByTestId('empty-state')).toBeVisible();
      await expect(reset).toBeVisible();
      expect(await page.getByTestId('role-card').first().evaluate((card) => {
        card.focus();
        return document.activeElement === card;
      })).toBe(false);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations).toEqual([]);

      await reset.click();
      await expect(reset).toBeFocused();
      await expect(department).toHaveValue('');
      await expect(location).toHaveValue('');
      await expectVisibleRoles(page, roles);
      await expect(page.getByTestId('roles-grid')).toBeVisible();
      await expect(page.getByTestId('empty-state')).toBeHidden();
    });

    test('supports keyboard filtering and reset and starts fresh on reload', async ({ page }) => {
      await page.goto('/');
      const roles = await getListedRoles(page);
      const department = page.getByRole('combobox', { name: 'Department', exact: true });
      const location = page.getByRole('combobox', { name: 'Location', exact: true });
      const lastDepartment = await department.locator('option').last().getAttribute('value');
      expect(lastDepartment).toBeTruthy();
      await department.focus();
      await department.press('End');
      await expect(department).toHaveValue(lastDepartment!);
      await expect(department).toBeFocused();
      await expectVisibleRoles(page, roles.filter((role) => role.department === lastDepartment));
      await department.press('Tab');
      await expect(location).toBeFocused();
      await location.press('Tab');
      const reset = page.getByRole('button', { name: 'Reset filters' });
      await expect(reset).toBeFocused();
      await reset.press('Enter');
      await expectVisibleRoles(page, roles);
      await expect(reset).toBeFocused();

      await department.selectOption('Finance');
      await location.selectOption('Helsinki, Finland');
      await page.reload();
      await expect(department).toHaveValue('');
      await expect(location).toHaveValue('');
      await expectVisibleRoles(page, roles);
    });

    test('links through to a role detail page', async ({ page }) => {
        await page.goto('/');
        const firstCard = page.getByTestId('role-card').first();
        const title = await firstCard.getByTestId('role-title').textContent();
        await firstCard.click();
        await expect(page.getByTestId('role-detail-title')).toHaveText(title!.trim());
        await expect(page.getByTestId('apply-form')).toBeVisible();
    });

    test.describe('Open roles without JavaScript', () => {
      test.use({ javaScriptEnabled: false });

      test('shows all roles and working links without inert filter controls', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('[data-testid="role-card"]:visible')).toHaveCount(expectedRoleCount);
        await expect(page.getByTestId('department-filter')).toBeHidden();
        await expect(page.getByTestId('location-filter')).toBeHidden();
        await expect(page.getByTestId('filters-reset')).toBeHidden();
        await expect(page.getByTestId('empty-state')).toBeHidden();
        await page.getByTestId('role-card').first().click();
        await expect(page.getByTestId('role-detail-title')).toBeVisible();
        await expect(page.getByTestId('apply-form')).toBeVisible();
      });
    });

    for (const { title, location } of [
        { title: 'Senior Frontend Engineer', location: 'Remote (US & Canada)' },
        { title: 'Financial Analyst', location: 'Woodinville, WA, USA' },
    ]) {
        test(`shows ${title} location on the card and details`, async ({ page }) => {
            await page.goto('/');
            const card = page.getByTestId('role-card').filter({
                has: page.getByRole('heading', { name: title, exact: true }),
            });

            await expect(card).toBeVisible();
            await expect(card.getByTestId('role-location')).toHaveText(location);
            await expect(card.getByTestId('role-location')).toBeVisible();
            await card.click();
            await expect(page.getByText(location, { exact: true })).toBeVisible();
        });
    }

    test('has no automatically detectable accessibility violations', async ({ page }) => {
        await page.goto('/');
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();
        expect(results.violations).toEqual([]);
    });
});
