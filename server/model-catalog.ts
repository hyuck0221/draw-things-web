import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const MAXIMUM_METADATA_BYTES = 8 * 1024 * 1024
const MAXIMUM_MODELS = 4_096
const MAXIMUM_FILE_CHARACTERS = 255
const MAXIMUM_LABEL_CHARACTERS = 512
const FILESYSTEM_OPERATION_TIMEOUT_MS = 1_500

export interface LocalModelRecord extends Record<string, unknown> {
  file: string
  name?: string
  version?: string
  modifier?: string
  source: 'local-metadata'
}

export interface LocalModelCatalog {
  models: LocalModelRecord[]
  directoriesScanned: number
  warnings: string[]
}

export async function defaultDrawThingsModelDirectories() {
  const containers = join(homedir(), 'Library', 'Containers')
  return [
    join(containers, 'com.liuliu.draw-things', 'Data', 'Documents', 'Models'),
  ]
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs = FILESYSTEM_OPERATION_TIMEOUT_MS) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('filesystem-timeout')), timeoutMs)
  })
  try {
    return await Promise.race([operation, expired])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function existingDirectories(paths: readonly string[]) {
  const directories: string[] = []
  for (const path of paths) {
    const normalized = resolve(path)
    try {
      if ((await withTimeout(stat(normalized))).isDirectory()) directories.push(normalized)
    } catch {
      // Optional or uninstalled Draw Things containers are ignored.
    }
  }
  return [...new Set(directories)]
}

interface MetadataReadResult {
  records: Record<string, unknown>[]
  warning?: string
}

function isMissingFile(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT'
}

async function readMetadataArray(path: string): Promise<MetadataReadResult> {
  const label = basename(path)
  try {
    const metadata = await withTimeout(stat(path))
    if (!metadata.isFile()) return { records: [], warning: `${label}이 일반 파일이 아닙니다.` }
    if (metadata.size <= 0) return { records: [], warning: `${label}이 비어 있습니다.` }
    if (metadata.size > MAXIMUM_METADATA_BYTES) {
      return { records: [], warning: `${label}이 8 MiB 읽기 제한을 초과했습니다.` }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FILESYSTEM_OPERATION_TIMEOUT_MS)
    let serialized: string
    try {
      serialized = await readFile(path, { encoding: 'utf8', signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed)) return { records: [], warning: `${label} 형식이 JSON 배열이 아닙니다.` }
    const records = parsed.filter((value): value is Record<string, unknown> => (
      typeof value === 'object' && value !== null && !Array.isArray(value)
    ))
    return records.length === parsed.length
      ? { records }
      : { records, warning: `${label}에서 잘못된 메타데이터 항목을 제외했습니다.` }
  } catch (error) {
    return isMissingFile(error)
      ? { records: [] }
      : { records: [], warning: `${label}을 읽거나 해석하지 못했습니다.` }
  }
}

async function installedCheckpointFiles(
  directories: readonly string[],
  candidates: readonly string[],
) {
  const files = new Set<string>()
  const concurrency = 32
  for (let start = 0; start < candidates.length; start += concurrency) {
    const batch = candidates.slice(start, start + concurrency)
    const installed = await Promise.all(batch.map(async (file) => {
      for (const directory of directories) {
        try {
          const metadata = await withTimeout(stat(join(directory, file)))
          if (metadata.isFile() && metadata.size > 0) return file
        } catch {
          // Missing, protected, or temporarily unavailable files are ignored.
        }
      }
      return undefined
    }))
    for (const file of installed) if (file) files.add(file)
  }
  return files
}

function modelRecord(value: Record<string, unknown>): LocalModelRecord | undefined {
  const file = typeof value.file === 'string' ? value.file.trim() : ''
  if (!file || file.length > MAXIMUM_FILE_CHARACTERS
    || basename(file) !== file || !file.toLowerCase().endsWith('.ckpt')) return undefined
  const label = (key: 'name' | 'version' | 'modifier') => {
    const text = typeof value[key] === 'string' ? value[key].trim() : ''
    return text ? text.slice(0, MAXIMUM_LABEL_CHARACTERS) : undefined
  }
  return {
    file,
    ...(label('name') ? { name: label('name') } : {}),
    ...(label('version') ? { version: label('version') } : {}),
    ...(label('modifier') ? { modifier: label('modifier') } : {}),
    source: 'local-metadata',
  }
}

export async function listLocalDrawThingsModels(
  configuredDirectories?: readonly string[],
): Promise<LocalModelCatalog> {
  const requested = configuredDirectories?.length
    ? configuredDirectories
    : await defaultDrawThingsModelDirectories()
  const directories = await existingDirectories(requested)
  if (directories.length === 0) {
    return {
      models: [],
      directoriesScanned: 0,
      warnings: ['Draw Things 기본 모델 폴더를 찾지 못했습니다.'],
    }
  }

  const specifications = new Map<string, LocalModelRecord>()
  const warnings: string[] = []
  const downloadedCatalogs: string[] = []
  const customCatalogs: string[] = []
  for (const directory of directories) {
    const dataDirectory = dirname(dirname(directory))
    downloadedCatalogs.push(
      join(dataDirectory, 'Library', 'Caches', 'net', 'models.json'),
      join(dataDirectory, 'Library', 'Caches', 'net', 'uncurated_models.json'),
    )
    customCatalogs.push(join(directory, 'custom.json'))
  }
  const [downloadedMetadata, customMetadata] = await Promise.all([
    Promise.all(downloadedCatalogs.map(readMetadataArray)),
    Promise.all(customCatalogs.map(readMetadataArray)),
  ])
  for (const metadata of downloadedMetadata) {
    if (metadata.warning) warnings.push(metadata.warning)
    for (const value of metadata.records) {
      const model = modelRecord(value)
      if (model) specifications.set(model.file, model)
    }
  }
  // User-imported metadata must win over every downloaded catalog, including
  // catalogs found for another configured model directory.
  for (const metadata of customMetadata) {
    if (metadata.warning) warnings.push(metadata.warning)
    for (const value of metadata.records) {
      const model = modelRecord(value)
      if (model) specifications.set(model.file, model)
    }
  }

  const installed = await installedCheckpointFiles(directories, [...specifications.keys()])
  const models = [...specifications.values()]
    .filter((model) => installed.has(model.file))
    .sort((left, right) => (left.name ?? left.file).localeCompare(right.name ?? right.file, 'ko'))
    .slice(0, MAXIMUM_MODELS)
  if (models.length === 0) {
    warnings.push('설치된 주 모델 메타데이터를 찾지 못했습니다. 보조 VAE·CLIP·T5 파일은 목록에서 제외됩니다.')
  }
  return { models, directoriesScanned: directories.length, warnings: [...new Set(warnings)] }
}
