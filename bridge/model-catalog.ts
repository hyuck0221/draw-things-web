import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { resolveRecommendedSettings, type RecommendedSettings } from '../src/lib/draw-things/recommended-settings.ts'
import { isPlainObject } from './security.ts'

const MAX_METADATA_BYTES = 8 * 1024 * 1024
const DRAW_THINGS_CONTAINER = /draw[. _-]?things/i

export interface LocalModelRecord extends Record<string, unknown> {
  file: string
  name?: string
  version?: string
  modifier?: string
  defaultScale?: number
  recommendedSettings?: RecommendedSettings
  source: 'local-metadata'
}

export interface LocalModelCatalog {
  models: LocalModelRecord[]
  directoriesScanned: number
  warnings: string[]
}

export async function defaultDrawThingsModelDirectories(): Promise<string[]> {
  const containers = join(homedir(), 'Library', 'Containers')
  const candidates = new Set<string>([
    join(containers, 'com.liuliu.draw-things', 'Data', 'Documents', 'Models'),
  ])
  try {
    const entries = await readdir(containers, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || !DRAW_THINGS_CONTAINER.test(entry.name)) continue
      candidates.add(join(containers, entry.name, 'Data', 'Documents', 'Models'))
    }
  } catch {
    // The known sandbox path below remains the fallback.
  }
  return [...candidates]
}

async function existingDirectories(paths: readonly string[]): Promise<string[]> {
  const directories: string[] = []
  for (const path of paths) {
    const normalized = resolve(path)
    try {
      if ((await stat(normalized)).isDirectory()) directories.push(normalized)
    } catch {
      // Optional or uninstalled Draw Things containers are ignored.
    }
  }
  return [...new Set(directories)]
}

async function readMetadataArray(path: string): Promise<Record<string, unknown>[]> {
  try {
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_METADATA_BYTES) return []
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is Record<string, unknown> => isPlainObject(value))
  } catch {
    return []
  }
}

async function installedCheckpointFiles(directories: readonly string[]): Promise<Set<string>> {
  const files = new Set<string>()
  for (const directory of directories) {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if ((!entry.isFile() && !entry.isSymbolicLink()) || !entry.name.toLowerCase().endsWith('.ckpt')) continue
      try {
        if ((await stat(join(directory, entry.name))).size > 0) files.add(entry.name)
      } catch {
        // Broken links and files that disappear during scanning are ignored.
      }
    }
  }
  return files
}

function modelRecord(value: Record<string, unknown>): LocalModelRecord | undefined {
  const file = typeof value.file === 'string' ? value.file.trim() : ''
  if (!file || basename(file) !== file || !file.toLowerCase().endsWith('.ckpt')) return undefined
  const defaultScale = Number(value.default_scale)
  return {
    file,
    ...(typeof value.name === 'string' && value.name.trim() ? { name: value.name.trim() } : {}),
    ...(typeof value.version === 'string' && value.version.trim() ? { version: value.version.trim() } : {}),
    ...(typeof value.modifier === 'string' && value.modifier.trim() ? { modifier: value.modifier.trim() } : {}),
    ...(Number.isInteger(defaultScale) && defaultScale >= 2 && defaultScale <= 128 ? { defaultScale } : {}),
    source: 'local-metadata',
  }
}

export async function listLocalDrawThingsModels(
  configuredDirectories?: readonly string[],
  selectedLoRAs: readonly string[] = [],
): Promise<LocalModelCatalog> {
  const requested = configuredDirectories?.length
    ? configuredDirectories
    : await defaultDrawThingsModelDirectories()
  const directories = await existingDirectories(requested)
  if (directories.length === 0) {
    return {
      models: [],
      directoriesScanned: 0,
      warnings: ['Draw Things 기본 모델 폴더를 찾지 못했습니다. 외부 폴더는 커넥터의 --models-dir 옵션으로 추가할 수 있습니다.'],
    }
  }

  const specifications = new Map<string, LocalModelRecord>()
  const recommendedConfigurations: Record<string, unknown>[] = []
  for (const directory of directories) {
    const dataDirectory = dirname(dirname(directory))
    const catalogPaths = [
      join(dataDirectory, 'Library', 'Caches', 'net', 'models.json'),
      join(dataDirectory, 'Library', 'Caches', 'net', 'uncurated_models.json'),
    ]
    for (const path of catalogPaths) {
      for (const value of await readMetadataArray(path)) {
        const model = modelRecord(value)
        if (model && !specifications.has(model.file)) specifications.set(model.file, model)
      }
    }
    recommendedConfigurations.push(...await readMetadataArray(
      join(dataDirectory, 'Library', 'Caches', 'net', 'configs.json'),
    ))
  }
  // Custom metadata takes precedence over the downloaded catalog display name.
  for (const directory of directories) {
    for (const value of await readMetadataArray(join(directory, 'custom.json'))) {
      const model = modelRecord(value)
      if (model) specifications.set(model.file, model)
    }
  }

  const installed = await installedCheckpointFiles(directories)
  const models = [...specifications.values()]
    .filter((model) => installed.has(model.file))
    .map((model) => {
      const recommendedSettings = resolveRecommendedSettings(model, recommendedConfigurations, selectedLoRAs)
      return recommendedSettings ? { ...model, recommendedSettings } : model
    })
    .sort((left, right) => (left.name ?? left.file).localeCompare(right.name ?? right.file, 'ko'))
  const warnings: string[] = []
  if (models.length === 0) {
    warnings.push('설치된 주 모델 메타데이터를 찾지 못했습니다. 보조 VAE·CLIP·T5 파일은 목록에서 제외됩니다.')
  }
  if (recommendedConfigurations.length === 0) {
    warnings.push('로컬 configs.json 추천 설정 캐시가 없어 모델은 표시하지만 권장 설정은 자동 적용하지 않습니다.')
  }
  return { models, directoriesScanned: directories.length, warnings }
}
