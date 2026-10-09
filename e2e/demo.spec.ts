import { expect, test } from '@playwright/test'

test('a pessoa pode revisar uma vaga e colocá-la na fila demo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Vagas para você' })).toBeVisible()
  await expect(page.getByText(/candidaturas não são enviadas/i)).toBeVisible()
  const card = page.getByRole('article').filter({ hasText: 'Wildlife Studios' })
  await card.getByRole('button', { name: /adicionar à fila/i }).click()
  await expect(card.getByRole('button', { name: /na fila/i })).toBeVisible()
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: /Fila/ }).click()
  await expect(page.getByRole('heading', { name: 'Fila', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Frontend Developer/ })).toBeVisible()
})