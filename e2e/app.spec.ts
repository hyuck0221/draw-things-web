import { expect, test } from '@playwright/test'

test('guides a first-time user through local connection setup', async ({ page }) => {
  await page.route('http://127.0.0.1:47821/v1/bridge/health', async (route) => route.abort())
  await page.goto('/')
  const dialog = page.getByRole('dialog', { name: 'Draw Things 연결' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('로컬 커넥터가 가장 안정적입니다')).toBeVisible()
  await expect(dialog.getByText(/Mac에서 실행하세요/)).toBeVisible()
  await expect(dialog.getByText(/Node\.js 22\.12 이상/)).toBeVisible()
  await expect(dialog.getByLabel('호스트')).toHaveValue('127.0.0.1')
  await expect(dialog.getByRole('button', { name: '연결 테스트' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: '이 설정 사용' })).toBeDisabled()
})

test('loads when an HTTP IP origin does not expose crypto.randomUUID', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    })
  })
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: 'Draw Things 연결' })).toBeVisible()
  await page.getByRole('button', { name: '연결 옵션 전체 보기' }).click()
  await expect(page.getByLabel('커넥터 페어링 토큰')).not.toHaveValue('')
})

test('opens the canvas and the complete parameter drawer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  await page.goto('/')
  await page.getByRole('button', { name: '나중에' }).click()
  await expect(page.getByRole('heading', { name: '첫 장면을 그려보세요' })).toBeVisible()
  await expect(page.getByRole('button', { name: /연결 상태: 연결 안 됨/ })).toBeVisible()
  await expect(page.getByLabel('이미지 프롬프트')).toBeVisible()

  await page.getByRole('button', { name: /전체 84개 설정/ }).click()
  await expect(page.getByRole('complementary', { name: '전체 생성 설정' })).toBeVisible()
  await expect(page.getByPlaceholder('설정 이름 또는 API 키 검색')).toBeVisible()
  await page.getByPlaceholder('설정 이름 또는 API 키 검색').fill('tea cache')
  await expect(page.getByRole('checkbox', { name: 'TeaCache', exact: true })).toBeVisible()
})

test('keeps the essential workflow usable on a phone-sized viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium')
  await page.route('http://127.0.0.1:47821/v1/models', async (route) => route.abort())
  await page.goto('/')
  await page.getByRole('button', { name: '나중에' }).click()
  await expect(page.getByLabel('이미지 프롬프트')).toBeVisible()
  await expect(page.getByRole('button', { name: /연결 상태: 연결 안 됨/ })).toBeVisible()
  await expect(page.locator('.connection-pill__label--mobile')).toHaveText('연결 안 됨')
  await expect(page.getByLabel('모바일 설치 모델')).toBeVisible()
  await page.getByRole('button', { name: '설치 모델 목록 새로고침' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '전체 설정' }).click()
  await expect(page.getByRole('complementary', { name: '전체 생성 설정' })).toBeVisible()
  await page.getByRole('button', { name: '설정 닫기' }).click()
  await expect(page.getByRole('main').getByRole('button', { name: '연결 설정', exact: true })).toBeVisible()
})

test('connects, generates, and restores a local canvas through the bridge contract', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  await page.goto('/')
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl+AAAAAASUVORK5CYII='
  const capabilities = {
    protocol: 'http',
    canGenerate: true,
    canImageToImage: true,
    canStreamProgress: false,
    canCancel: false,
    canBrowseModels: false,
    requiresHttpModeForCanvas: false,
    sharedSecretRequired: false,
    models: [],
    loras: [],
    controls: [],
    textualInversions: [],
    limitations: [],
  }
  let generatedWithModel = ''

  await page.route('http://127.0.0.1:47821/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/v1/bridge/health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, name: 'test-bridge', version: 'test', paired: true }),
      })
      return
    }
    if (path === '/v1/test') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          latencyMs: 2,
          checkedAt: Date.now(),
          phase: 'online',
          message: 'Draw Things HTTP API에 연결했습니다.',
          endpoint: 'http://127.0.0.1:7859',
          capabilities,
          remoteOptions: { model: 'mock.ckpt', width: 1024, height: 1024 },
        }),
      })
      return
    }
    if (path === '/v1/models') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          models: [
            { file: 'mock.ckpt', name: 'Mock Model' },
            { file: 'second.ckpt', name: 'Second Model' },
          ],
          source: 'local-metadata',
          checkedAt: Date.now(),
          stale: false,
          directoriesScanned: 1,
          warnings: [],
        }),
      })
      return
    }
    if (path === '/v1/generate') {
      const body = JSON.parse(request.postData() ?? '{}') as { request?: { id?: string; parameters?: { model?: string } } }
      const requestId = body.request?.id ?? 'mock-request'
      generatedWithModel = body.request?.parameters?.model ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: [
          JSON.stringify({ type: 'accepted', requestId, message: '요청을 받았습니다.' }),
          JSON.stringify({ type: 'result', requestId, images: [png], durationMs: 12 }),
        ].join('\n'),
      })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  })

  await page.reload()
  const dialog = page.getByRole('dialog', { name: 'Draw Things 연결' })
  await dialog.getByRole('button', { name: '연결 테스트' }).click()
  await expect(dialog.getByText('Draw Things HTTP API에 연결했습니다.')).toBeVisible()
  await expect(dialog.getByText('커넥터와 Draw Things 연결을 확인했습니다')).toBeVisible()
  await expect(dialog.locator('.connection-result')).toHaveAttribute('role', 'status')
  await expect(dialog.getByRole('button', { name: '연결 확인됨' })).toBeVisible()
  await dialog.getByRole('button', { name: '이 설정 사용' }).click()

  const modelSelect = page.getByLabel('설치된 모델')
  await expect(modelSelect.locator('option')).toHaveCount(2)
  await modelSelect.selectOption('second.ckpt')

  await page.getByRole('button', { name: /전체 84개 설정/ }).click()
  await page.getByPlaceholder('설정 이름 또는 API 키 검색').fill('리파이너 모델')
  const refinerSelect = page.getByLabel('리파이너 모델')
  await expect(refinerSelect.locator('option')).toHaveCount(3)
  await refinerSelect.selectOption('mock.ckpt')
  await refinerSelect.selectOption('')
  await expect(refinerSelect).toHaveValue('')
  await page.getByRole('button', { name: '설정 닫기' }).click()

  await page.getByLabel('이미지 프롬프트').fill('보랏빛 숲의 작은 여우')
  await page.getByRole('button', { name: /생성/ }).click()
  await expect(page.locator('.canvas-item img')).toBeVisible()
  expect(generatedWithModel).toBe('second.ckpt')
  await expect(page.getByLabel('이미지 프롬프트')).toHaveValue('')

  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.locator('.canvas-item img')).toBeVisible()
})

test('migrates embedded v1 images into the v2 image store without losing them', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl+AAAAAASUVORK5CYII='

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
  }, png)

  await page.unroute('**/src/main.tsx')
  await page.reload()
  await expect(page.locator('.canvas-item img')).toBeVisible()
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.locator('.canvas-item img')).toBeVisible()
})
