// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listLocalDrawThingsModels } from './model-catalog'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('local Draw Things model catalog', () => {
  it('lists installed primary models and excludes support checkpoints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'draw-things-models-'))
    temporaryDirectories.push(root)
    const modelsDirectory = join(root, 'Data', 'Documents', 'Models')
    const cacheDirectory = join(root, 'Data', 'Library', 'Caches', 'net')
    await mkdir(modelsDirectory, { recursive: true })
    await mkdir(cacheDirectory, { recursive: true })
    await writeFile(join(modelsDirectory, 'primary.ckpt'), 'checkpoint')
    await writeFile(join(modelsDirectory, 'vae.ckpt'), 'support')
    await writeFile(join(cacheDirectory, 'models.json'), JSON.stringify([
      { file: 'primary.ckpt', name: 'Primary model', version: 'sdxl' },
    ]))
    await writeFile(join(cacheDirectory, 'uncurated_models.json'), '[]')

    await expect(listLocalDrawThingsModels([modelsDirectory])).resolves.toEqual({
      models: [{
        file: 'primary.ckpt',
        name: 'Primary model',
        version: 'sdxl',
        source: 'local-metadata',
      }],
      directoriesScanned: 1,
      warnings: [],
    })
  })

  it('lets custom metadata override downloaded display metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'draw-things-custom-model-'))
    temporaryDirectories.push(root)
    const modelsDirectory = join(root, 'Data', 'Documents', 'Models')
    const cacheDirectory = join(root, 'Data', 'Library', 'Caches', 'net')
    await mkdir(modelsDirectory, { recursive: true })
    await mkdir(cacheDirectory, { recursive: true })
    await writeFile(join(modelsDirectory, 'custom.ckpt'), 'checkpoint')
    await writeFile(join(cacheDirectory, 'models.json'), JSON.stringify([
      { file: 'custom.ckpt', name: 'Old name' },
    ]))
    await writeFile(join(modelsDirectory, 'custom.json'), JSON.stringify([
      { file: 'custom.ckpt', name: 'My custom name' },
    ]))

    const secondRoot = await mkdtemp(join(tmpdir(), 'draw-things-second-catalog-'))
    temporaryDirectories.push(secondRoot)
    const secondModelsDirectory = join(secondRoot, 'Data', 'Documents', 'Models')
    const secondCacheDirectory = join(secondRoot, 'Data', 'Library', 'Caches', 'net')
    await mkdir(secondModelsDirectory, { recursive: true })
    await mkdir(secondCacheDirectory, { recursive: true })
    await writeFile(join(secondModelsDirectory, 'custom.ckpt'), 'same installed checkpoint')
    await writeFile(join(secondCacheDirectory, 'models.json'), JSON.stringify([
      { file: 'custom.ckpt', name: 'Later downloaded name' },
    ]))

    const catalog = await listLocalDrawThingsModels([modelsDirectory, secondModelsDirectory])
    expect(catalog.models).toEqual([{ file: 'custom.ckpt', name: 'My custom name', source: 'local-metadata' }])
  })

  it('reports a damaged metadata file without hiding models from healthy metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'draw-things-damaged-catalog-'))
    temporaryDirectories.push(root)
    const modelsDirectory = join(root, 'Data', 'Documents', 'Models')
    const cacheDirectory = join(root, 'Data', 'Library', 'Caches', 'net')
    await mkdir(modelsDirectory, { recursive: true })
    await mkdir(cacheDirectory, { recursive: true })
    await writeFile(join(modelsDirectory, 'healthy.ckpt'), 'checkpoint')
    await writeFile(join(cacheDirectory, 'models.json'), JSON.stringify([
      { file: 'healthy.ckpt', name: 'Healthy' },
    ]))
    await writeFile(join(cacheDirectory, 'uncurated_models.json'), '{not valid json')

    const catalog = await listLocalDrawThingsModels([modelsDirectory])
    expect(catalog.models).toHaveLength(1)
    expect(catalog.warnings).toContain('uncurated_models.json을 읽거나 해석하지 못했습니다.')
  })
})
