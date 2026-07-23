import { expect, test, type Page } from '@playwright/test'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl+AAAAAASUVORK5CYII='

async function mockModelCatalog(page: Page, currentModel = 'mock.ckpt') {
  await page.route('**/local-api/v1/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          { file: currentModel, name: 'Current model', source: 'local-metadata' },
          { file: 'installed-second.ckpt', name: 'Installed second', source: 'local-metadata' },
        ],
        directoriesScanned: 1,
        warnings: [],
      }),
    })
  })
}

async function mockOptions(page: Page, overrides: Record<string, unknown> = {}) {
  const currentModel = typeof overrides.model === 'string' ? overrides.model : 'mock.ckpt'
  await mockModelCatalog(page, currentModel)
  await page.route('**/sdapi/v1/options', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'mock.ckpt',
        width: 1024,
        height: 1024,
        steps: 16,
        upscaler: '',
        ...overrides,
      }),
    })
  })
}

test('checks the same-origin API automatically and exposes a status dialog', async ({ page }) => {
  await page.route('**/sdapi/v1/options', async (route) => route.abort())
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '첫 장면을 그려보세요' })).toBeVisible()
  await page.getByRole('button', { name: 'API 상태 열기' }).click()

  const dialog = page.getByRole('dialog', { name: 'Draw Things API 상태' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('별도 연결 설정 없이 현재 사이트와 같은 주소로 통신합니다.')).toBeVisible()
  await expect(dialog.getByText('http://127.0.0.1:5173/sdapi/v1/options')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '다시 확인' })).toBeEnabled()
  await expect(dialog.getByLabel('호스트')).toHaveCount(0)
})

test('opens the canvas and the complete HTTP parameter drawer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  await mockOptions(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '첫 장면을 그려보세요' })).toBeVisible()
  await expect(page.getByLabel('이미지 프롬프트')).toBeVisible()
  await expect(page.getByRole('button', { name: /API 상태: Draw Things 연결됨/ })).toBeVisible()

  const modelSelect = page.locator('.inspector-panel').getByLabel('현재 Draw Things 모델')
  await expect(modelSelect.locator('option')).toHaveCount(2)
  await modelSelect.selectOption('installed-second.ckpt')

  await page.getByRole('button', { name: '전체 API 설정' }).click()
  await expect(page.getByRole('complementary', { name: '전체 생성 설정' })).toBeVisible()
  await expect(page.getByPlaceholder('설정 이름 또는 API 키 검색')).toBeVisible()
  await page.getByPlaceholder('설정 이름 또는 API 키 검색').fill('tea cache')
  await expect(page.getByRole('checkbox', { name: 'TeaCache', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '기본값으로 되돌리기' }).click()
  await expect(modelSelect).toHaveValue('installed-second.ckpt')
})

test('keeps the essential workflow usable on a phone-sized viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium')
  await mockOptions(page)
  await page.goto('/')

  await expect(page.getByLabel('이미지 프롬프트')).toBeVisible()
  await expect(page.locator('.connection-pill__label--mobile')).toHaveText('연결됨')
  const mobileOptions = page.locator('.prompt-options-mobile')
  await expect(mobileOptions.getByLabel('현재 Draw Things 모델')).toHaveValue('mock.ckpt')
  await expect(mobileOptions.getByLabel('현재 Draw Things 모델').locator('option')).toHaveCount(2)
  await mobileOptions.getByRole('button', { name: '현재 모델 다시 확인' }).click()
  await expect(mobileOptions.getByLabel('현재 Draw Things 모델')).toHaveValue('mock.ckpt')

  await page.getByRole('button', { name: '전체 설정' }).click()
  await expect(page.getByRole('complementary', { name: '전체 생성 설정' })).toBeVisible()
  await page.getByRole('button', { name: '설정 닫기' }).click()
  await expect(page.getByRole('button', { name: 'API 상태 열기' })).toBeVisible()
})

test('generates and restores a local canvas through the direct HTTP contract', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  let generatedBody: Record<string, unknown> | undefined

  await mockOptions(page)
  await page.route('**/sdapi/v1/txt2img', async (route) => {
    generatedBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ images: [png], parameters: {}, info: '' }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /API 상태: Draw Things 연결됨/ })).toBeVisible()

  const modelSelect = page.locator('.inspector-panel').getByLabel('현재 Draw Things 모델')
  await expect(modelSelect.locator('option')).toHaveCount(2)
  await expect(modelSelect).toHaveValue('mock.ckpt')

  await page.getByLabel('이미지 프롬프트').fill('보랏빛 숲의 작은 여우')
  await page.getByRole('button', { name: /생성/ }).click()
  await expect(page.locator('.canvas-item img')).toBeVisible()
  expect(generatedBody?.prompt).toBe('보랏빛 숲의 작은 여우')
  expect(generatedBody?.model).toBe('mock.ckpt')
  expect(generatedBody).not.toHaveProperty('upscaler')
  await expect(page.getByLabel('이미지 프롬프트')).toHaveValue('')

  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.locator('.canvas-item img')).toBeVisible()
})

test('can select a locally installed model when Draw Things options has no current model', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  let requestedModel = ''
  await mockOptions(page, { model: null, width: 512, height: 512 })
  await page.route('**/sdapi/v1/txt2img', async (route) => {
    requestedModel = String((JSON.parse(route.request().postData() ?? '{}') as { model?: unknown }).model ?? '')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ images: [png], parameters: {}, info: '' }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /API 상태: Draw Things 연결됨/ })).toBeVisible()
  await page.getByLabel('이미지 프롬프트').fill('로컬 모델로 첫 생성')
  await expect(page.getByRole('button', { name: /API 상태/ }).last()).toBeVisible()

  const modelSelect = page.locator('.inspector-panel').getByLabel('현재 Draw Things 모델')
  await expect(modelSelect.locator('option')).toHaveCount(3)
  await modelSelect.selectOption('mock.ckpt')
  await expect(page.getByRole('button', { name: /생성/ })).toBeEnabled()
  await page.getByRole('button', { name: /생성/ }).click()
  await expect(page.locator('.canvas-item img')).toBeVisible()
  expect(requestedModel).toBe('mock.ckpt')
})

test('pauses options polling while an HTTP generation request is pending', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  let optionsRequests = 0
  let releaseGeneration!: () => void
  let markGenerationStarted!: () => void
  const generationRelease = new Promise<void>((resolve) => { releaseGeneration = resolve })
  const generationStarted = new Promise<void>((resolve) => { markGenerationStarted = resolve })

  await mockModelCatalog(page)
  await page.route('**/sdapi/v1/options', async (route) => {
    optionsRequests += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'mock.ckpt',
        width: 512,
        height: 512,
        steps: 16,
        upscaler: '',
      }),
    })
  })
  await page.route('**/sdapi/v1/txt2img', async (route) => {
    markGenerationStarted()
    await generationRelease
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ images: [png], parameters: {}, info: '' }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /API 상태: Draw Things 연결됨/ })).toBeVisible()
  await page.getByLabel('이미지 프롬프트').fill('생성 중 heartbeat 중지 검사')
  await page.getByRole('button', { name: /생성/ }).click()
  await generationStarted
  await expect(page.getByText('Draw Things가 처리 중입니다')).toBeVisible()
  await expect(page.locator('.generation-progress')).not.toContainText('%')

  const requestsAtGenerationStart = optionsRequests
  try {
    await page.waitForTimeout(5_500)
    expect(optionsRequests).toBe(requestsAtGenerationStart)
  } finally {
    releaseGeneration()
  }
  await expect(page.locator('.canvas-item img')).toBeVisible()
})

test('discards a cancelled result while keeping the generation lock until HTTP completion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  let releaseGeneration!: () => void
  let markGenerationStarted!: () => void
  const generationRelease = new Promise<void>((resolve) => { releaseGeneration = resolve })
  const generationStarted = new Promise<void>((resolve) => { markGenerationStarted = resolve })

  await mockOptions(page, { width: 512, height: 512 })
  await page.route('**/sdapi/v1/txt2img', async (route) => {
    markGenerationStarted()
    await generationRelease
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ images: [png], parameters: {}, info: '' }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /API 상태: Draw Things 연결됨/ })).toBeVisible()
  await page.getByLabel('이미지 프롬프트').fill('폐기할 생성 결과')
  await page.getByRole('button', { name: /생성/ }).click()
  await generationStarted
  try {
    await page.getByRole('button', { name: '중단' }).click()
    await expect(page.getByRole('button', { name: '마무리 중' })).toBeDisabled()
    await expect(page.locator('.canvas-item img')).toHaveCount(0)
  } finally {
    releaseGeneration()
  }

  await expect(page.getByRole('button', { name: /생성/ })).toBeEnabled()
  await expect(page.locator('.canvas-item img')).toHaveCount(0)
})

test('waits for a manual model refresh before starting generation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  let holdNextOptions = false
  let releaseOptions!: () => void
  let markOptionsStarted!: () => void
  const optionsRelease = new Promise<void>((resolve) => { releaseOptions = resolve })
  const optionsStarted = new Promise<void>((resolve) => { markOptionsStarted = resolve })
  let generationRequests = 0

  await mockModelCatalog(page)
  await page.route('**/sdapi/v1/options', async (route) => {
    if (holdNextOptions) {
      holdNextOptions = false
      markOptionsStarted()
      await optionsRelease
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ model: 'mock.ckpt', width: 512, height: 512, steps: 16, upscaler: '' }),
    })
  })
  await page.route('**/sdapi/v1/txt2img', async (route) => {
    generationRequests += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ images: [png], parameters: {}, info: '' }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /API 상태: Draw Things 연결됨/ })).toBeVisible()
  const refreshButton = page.getByRole('button', { name: '현재 모델 다시 확인' })
  await expect(refreshButton).toBeEnabled()
  holdNextOptions = true
  await refreshButton.click()
  await optionsStarted
  await page.getByLabel('이미지 프롬프트').fill('모델 확인 뒤 생성')
  await page.getByRole('button', { name: /생성/ }).click()
  try {
    await page.waitForTimeout(200)
    expect(generationRequests).toBe(0)
  } finally {
    releaseOptions()
  }
  await expect(page.locator('.canvas-item img')).toBeVisible()
  expect(generationRequests).toBe(1)
})

test('continues prompt context across generation and reload but isolates a new session', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const generatedPrompts: string[] = []
  await mockOptions(page, { width: 512, height: 512 })
  await page.route('**/sdapi/v1/txt2img', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { prompt?: string }
    generatedPrompts.push(body.prompt ?? '')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ images: [png], parameters: {}, info: '' }),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /API 상태: Draw Things 연결됨/ })).toBeVisible()
  await page.getByLabel('이미지 프롬프트').fill('첫 장면')
  await page.getByRole('button', { name: /생성/ }).click()
  await expect(page.locator('.canvas-item img')).toHaveCount(1)

  await page.getByLabel('이미지 프롬프트').fill('비를 추가')
  await page.getByRole('button', { name: /생성/ }).click()
  await expect(page.locator('.canvas-item img')).toHaveCount(2)
  expect(generatedPrompts[1]).toBe('첫 장면, 비를 추가')

  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.locator('.canvas-item img')).toHaveCount(2)
  await page.getByLabel('이미지 프롬프트').fill('붉은 우산')
  await page.getByRole('button', { name: /생성/ }).click()
  await expect(page.locator('.canvas-item img')).toHaveCount(3)
  expect(generatedPrompts[2]).toBe('첫 장면, 비를 추가, 붉은 우산')

  await page.getByRole('button', { name: '새 캔버스' }).click()
  await page.getByLabel('이미지 프롬프트').fill('독립된 사막')
  await page.getByRole('button', { name: /생성/ }).click()
  await expect(page.locator('.canvas-item img')).toHaveCount(1)
  expect(generatedPrompts[3]).toBe('독립된 사막')
})

test('moves a complete local canvas through a portable JSON backup', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const sourceContext = await browser.newContext({
    acceptDownloads: true,
    baseURL: 'http://127.0.0.1:5173',
  })
  const targetContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' })
  try {
    const source = await sourceContext.newPage()
    await mockOptions(source, { model: 'portable.ckpt', width: 512, height: 512 })
    await source.route('**/sdapi/v1/txt2img', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ images: [png], parameters: {}, info: '' }),
      })
    })
    await source.goto('/')
    await source.getByRole('button', { name: /네거티브 프롬프트/ }).click()
    await source.getByLabel('네거티브 프롬프트').fill('portable negative prompt')
    await source.getByLabel('이미지 프롬프트').fill('다른 origin으로 옮길 장면')
    await source.getByRole('button', { name: /생성/ }).click()
    await expect(source.locator('.canvas-item img')).toBeVisible()
    await source.getByRole('button', { name: 'API 상태 열기' }).click()

    const downloadPromise = source.waitForEvent('download')
    await source.getByRole('button', { name: '백업 내보내기' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^draw-things-canvas-backup_.*\.json$/)
    const backupPath = await download.path()
    expect(backupPath).not.toBeNull()

    const staleTab = await targetContext.newPage()
    await mockOptions(staleTab, { model: 'target.ckpt', width: 1024, height: 1024 })
    await staleTab.goto('/')
    await expect(staleTab.locator('.canvas-item img')).toHaveCount(0)

    const target = await targetContext.newPage()
    await mockOptions(target, { model: 'target.ckpt', width: 1024, height: 1024 })
    await target.goto('/')
    await expect(target.locator('.canvas-item img')).toHaveCount(0)
    await target.getByRole('button', { name: 'API 상태 열기' }).click()
    target.once('dialog', async (dialog) => dialog.accept())
    await target.getByLabel('로컬 백업 파일 선택').setInputFiles(backupPath!)

    await expect(target.getByRole('button', { name: 'API 상태 닫기' })).toBeDisabled()
    await expect(target.getByRole('button', { name: '닫기', exact: true })).toBeDisabled()
    await expect(target.locator('.canvas-item img')).toBeVisible({ timeout: 15_000 })
    await expect(target.locator('.inspector-panel').getByLabel('현재 Draw Things 모델')).toHaveValue('portable.ckpt')

    await staleTab.getByLabel('이미지 프롬프트').fill('가져오기 전 탭의 오래된 변경')
    await staleTab.getByRole('button', { name: /네거티브 프롬프트/ }).click()
    await staleTab.getByLabel('네거티브 프롬프트').fill('stale negative prompt')
    await expect(staleTab.locator('.top-bar__session small')).toHaveAttribute('title', /다른 탭에서 로컬 캔버스가 교체되었습니다/)
    await target.reload()
    await expect(target.locator('.canvas-item img')).toBeVisible()
    await expect(target.getByLabel('네거티브 프롬프트')).toHaveValue('portable negative prompt')
  } finally {
    await sourceContext.close()
    await targetContext.close()
  }
})

test('preserves migrated v1 generation settings on the first API heartbeat', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  await mockOptions(page, { model: 'remote.ckpt', width: 512, height: 512 })
  await page.addInitScript(() => {
    localStorage.setItem('draw-things-local-canvas:preferences:v1', JSON.stringify({
      version: 1,
      parameters: { model: 'legacy.ckpt', width: 768, height: 768, steps: 24 },
      negativePrompt: 'legacy negative',
      advancedPanelOpen: false,
      compactSidebar: false,
    }))
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /API 상태: Draw Things 연결됨/ })).toBeVisible()
  await expect(page.locator('.inspector-panel').getByLabel('현재 Draw Things 모델')).toHaveValue('legacy.ckpt')
  await expect(page.getByRole('spinbutton', { name: '너비' })).toHaveValue('768')
  await expect(page.getByRole('spinbutton', { name: '높이' })).toHaveValue('768')
})

test('migrates embedded v1 images into the v2 image store without losing them', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const legacyPng = `data:image/png;base64,${png}`

  await mockOptions(page)
  await page.route('**/src/main.tsx', async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: '' })
  })
  await page.goto('/')
  await page.evaluate(async (legacyImage) => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('draw-things-local-canvas')
      deletion.onsuccess = () => resolve()
      deletion.onerror = () => reject(deletion.error)
      deletion.onblocked = () => reject(new Error('test database deletion was blocked'))
    })
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('draw-things-local-canvas', 1)
      opening.onupgradeneeded = () => {
        const sessions = opening.result.createObjectStore('sessions', { keyPath: 'id' })
        sessions.createIndex('by-updated', 'updatedAt')
      }
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('sessions', 'readwrite')
      transaction.objectStore('sessions').put({
        id: 'legacy-session',
        title: '기존 캔버스',
        createdAt: 1,
        updatedAt: 1,
        turns: [],
        items: [{
          id: 'legacy-image',
          kind: 'generated',
          dataUrl: legacyImage,
          prompt: '기존 이미지',
          x: 0,
          y: 0,
          width: 120,
          height: 120,
          sourceWidth: 1,
          sourceHeight: 1,
          createdAt: 1,
        }],
        selectedItemId: 'legacy-image',
        view: { x: 0, y: 0, zoom: 1 },
        continuationEnabled: true,
        draftPrompt: '',
        useSelectedImage: false,
      })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    db.close()
  }, legacyPng)

  await page.unroute('**/src/main.tsx')
  await page.reload()
  await expect(page.locator('.canvas-item img')).toBeVisible()
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.locator('.canvas-item img')).toBeVisible()
})
