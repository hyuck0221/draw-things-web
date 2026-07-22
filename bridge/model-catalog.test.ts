import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listLocalDrawThingsModels } from './model-catalog.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('local Draw Things model catalog', () => {
  it('returns installed primary models while excluding dependency checkpoints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'draw-things-models-'))
    temporaryDirectories.push(root)
    const data = join(root, 'Data')
    const models = join(data, 'Documents', 'Models')
    const cache = join(data, 'Library', 'Caches', 'net')
    await mkdir(models, { recursive: true })
    await mkdir(cache, { recursive: true })
    await writeFile(join(models, 'custom.json'), JSON.stringify([
      { file: 'custom_main.ckpt', name: 'Custom Main', version: 'sdxl' },
    ]))
    await writeFile(join(cache, 'models.json'), JSON.stringify([
      { file: 'official_main.ckpt', name: 'Official Main', version: 'flux1' },
      { file: 'not_installed.ckpt', name: 'Missing' },
    ]))
    await writeFile(join(models, 'custom_main.ckpt'), 'model')
    await writeFile(join(models, 'official_main.ckpt'), 'model')
    await writeFile(join(models, 'clip_vit_l14_f16.ckpt'), 'dependency')

    const result = await listLocalDrawThingsModels([models])

    expect(result.directoriesScanned).toBe(1)
    expect(result.warnings).toEqual([])
    expect(result.models).toEqual([
      expect.objectContaining({ file: 'custom_main.ckpt', name: 'Custom Main' }),
      expect.objectContaining({ file: 'official_main.ckpt', name: 'Official Main' }),
    ])
    expect(result.models.map((model) => model.file)).not.toContain('clip_vit_l14_f16.ckpt')
    expect(result.models.map((model) => model.file)).not.toContain('not_installed.ckpt')
  })

  it('rejects metadata paths that could escape the model directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'draw-things-models-'))
    temporaryDirectories.push(root)
    const models = join(root, 'Models')
    await mkdir(models, { recursive: true })
    await writeFile(join(models, 'custom.json'), JSON.stringify([
      { file: '../outside.ckpt', name: 'Unsafe' },
    ]))
    await writeFile(join(root, 'outside.ckpt'), 'model')

    const result = await listLocalDrawThingsModels([models])

    expect(result.models).toEqual([])
  })
})
