import { expect, test } from '@playwright/test'

test('a pessoa pode revisar uma vaga e colocá-la na fila demo', async ({ page }) => {
  await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Encontre oportunidades. Acompanhe cada passo.' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Vagas' }).click()
  await expect(page.getByRole('heading', { name: 'Vagas para você' })).toBeVisible()
  await expect(page.getByText(/candidaturas não são enviadas/i)).toBeVisible()
  const card = page.getByRole('article').filter({ hasText: 'Wildlife Studios' })
  for (let pageIndex = 0; pageIndex < 5 && !(await card.isVisible()); pageIndex += 1) {
    const nextPage = page.getByRole('button', { name: 'Próxima' })
    if (!(await nextPage.isEnabled())) break
    await nextPage.click()
  }
  await card.getByRole('button', { name: /adicionar à fila/i }).click()
  await expect(card.getByRole('button', { name: /na fila/i })).toBeVisible()
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: /Fila/ }).click()
  await expect(page.getByRole('heading', { name: 'Fila', exact: true })).toBeVisible()
  const queuedJob = page.getByRole('button', { name: /Frontend Developer/ })
  for (let pageIndex = 0; pageIndex < 5 && !(await queuedJob.isVisible()); pageIndex += 1) {
    const nextPage = page.getByRole('button', { name: 'Próxima' })
    if (!(await nextPage.isEnabled())) break
    await nextPage.click()
  }
  await expect(queuedJob).toBeVisible()
})

test('telas mobile cabem na viewport sem rolagem vertical ou horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Navegação mobile' })

  for (const screen of ['Home', 'Vagas', 'Fila', 'Candidaturas', 'Perfil']) {
    await nav.getByRole('button', { name: new RegExp(screen) }).click()
    const dimensions = await page.evaluate(() => ({
      documentX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      documentY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      feedX: document.querySelector('.feed-column')!.scrollWidth - document.querySelector('.feed-column')!.clientWidth,
      feedY: document.querySelector('.feed-column')!.scrollHeight - document.querySelector('.feed-column')!.clientHeight,
    }))
    expect(dimensions, `${screen} deve caber na viewport`).toEqual({ documentX: 0, documentY: 0, feedX: 0, feedY: 0 })
  }

  await page.getByRole('tab', { name: 'LinkedIn' }).click()
  expect(await page.locator('.resume-workspace').evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
  await page.getByRole('tab', { name: 'Currículo' }).click()

  await nav.getByRole('button', { name: 'Vagas' }).click()
  await page.getByRole('button', { name: 'Senior Frontend Engineer' }).click()
  expect(await page.locator('.details-modal').evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
  await page.getByRole('tab', { name: 'Descrição' }).click()
  expect(await page.locator('.details-modal').evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0)
})