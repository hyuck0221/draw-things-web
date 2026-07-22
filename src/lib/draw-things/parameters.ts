import type { GenerationMode, GenerationParameters, ParameterValue } from '../../domain/types'

export type ParameterKind = 'string' | 'int' | 'float' | 'bool' | 'enum' | 'loras' | 'controls'

export interface ParameterDefinition {
  key: string
  aliases: string[]
  kind: ParameterKind
  min?: number
  max?: number
  label: string
  group: string
  when: string
  enumValues?: readonly string[]
  step?: number
  readOnlyReason?: string
  sourceNote?: string
}

export const PARAMETER_GROUPS: Record<string, { label: string; description: string }> = {
  model: { label: '모델', description: '체크포인트와 정제 모델' },
  output: { label: '출력', description: '크기와 배치' },
  sampling: { label: '샘플링', description: '시드, 스텝, 가이던스' },
  img2img: { label: '이미지 변형', description: '이미지 투 이미지 강도' },
  inpaint: { label: '인페인트', description: '마스크와 보존 범위' },
  hires: { label: '고해상도 보정', description: '2단계 고해상도 생성' },
  tileDecode: { label: '타일 디코딩', description: '디코더 메모리 절약' },
  tileDiffusion: { label: '타일 확산', description: '초대형 이미지 분할 생성' },
  sdxl: { label: 'SDXL 크기 조건', description: '원본·크롭·목표 해상도' },
  refiner: { label: '리파이너', description: '후반 정제 모델' },
  video: { label: '비디오', description: '프레임과 모션 조건' },
  stage2: { label: '2단계 모델', description: 'Stage 2 가이던스' },
  conditioning: { label: 'LoRA & Control', description: '추가 모델과 컨트롤 입력' },
  upscale: { label: '업스케일', description: '후처리 업스케일러' },
  textEncoder: { label: '텍스트 인코더', description: 'CLIP·T5 프롬프트 분리' },
  guidanceEmbed: { label: 'Guidance Embed', description: '가이던스 임베딩 모델' },
  teaCache: { label: 'TeaCache', description: '추론 가속 캐시' },
  causal: { label: '인과 추론', description: '비디오 시간축 추론' },
  guidance: { label: '고급 CFG', description: 'CFG-Zero* 옵션' },
  postprocess: { label: '후처리', description: '압축과 색상 보정' },
  imagePrior: { label: '이미지 Prior', description: 'Prior 기반 모델' },
  prompt: { label: '프롬프트', description: '고급 프롬프트 변환' },
  advanced: { label: '기타 고급', description: '모델별 세부 제어' },
}

export const SEED_MODES = [
  'Legacy',
  'Torch CPU Compatible',
  'Scale Alike',
  'NVIDIA GPU Compatible',
] as const

export const SAMPLERS = [
  'DPM++ 2M Karras', 'Euler a', 'DDIM', 'PLMS', 'DPM++ SDE Karras', 'UniPC', 'LCM',
  'Euler A Substep', 'DPM++ SDE Substep', 'TCD', 'Euler A Trailing',
  'DPM++ SDE Trailing', 'DPM++ 2M AYS', 'Euler A AYS', 'DPM++ SDE AYS',
  'DPM++ 2M Trailing', 'DDIM Trailing', 'UniPC Trailing', 'UniPC AYS', 'TCD Trailing',
] as const

const E = {
  seedMode: SEED_MODES,
  sampler: SAMPLERS,
  compression: ['disabled', 'h264', 'h265', 'jpeg'] as const,
  color: ['none', 'lab'] as const,
}

type RawParameter = readonly [
  key: string,
  aliases: readonly string[],
  kind: string,
  min: number | null,
  max: number | null,
  label: string,
  group: string,
  when: string,
  flags?: readonly string[],
]

const RAW_PARAMETERS: readonly RawParameter[] = [
  ['model', [], 'string', null, null, '모델', 'model', 'always'],
  ['width', [], 'int', 128, 8192, '너비', 'output', 'always', ['step64']],
  ['height', [], 'int', 128, 8192, '높이', 'output', 'always', ['step64']],
  ['seed', [], 'int', -1, 4294967295, '시드', 'sampling', 'always', ['minusOneRandom']],
  ['guidance_scale', ['cfg_scale'], 'float', 0, 50, 'CFG 스케일', 'sampling', 'always'],
  ['seed_mode', [], 'enum:seedMode', null, null, '시드 방식', 'sampling', 'advanced'],
  ['steps', [], 'int', 1, 150, '스텝', 'sampling', 'always'],
  ['batch_count', ['n_iter'], 'int', 1, 100, '배치 반복', 'output', 'always'],
  ['batch_size', [], 'int', 1, 4, '배치 크기', 'output', 'always'],
  ['sampler', ['sampler_name', 'sampler_index'], 'enum:sampler', null, null, '샘플러', 'sampling', 'always'],
  ['strength', ['denoising_strength'], 'float', 0, 1, '디노이즈 강도', 'img2img', 'route=img2img'],
  ['clip_skip', [], 'int', 1, 23, 'CLIP 건너뛰기', 'sampling', 'advanced'],
  ['image_guidance', [], 'float', 0, 25, '이미지 가이던스', 'img2img', 'route=img2img'],
  ['mask_blur', [], 'float', 0, 25, '마스크 블러', 'inpaint', 'route=inpaint'],
  ['mask_blur_outset', [], 'int', -100, 1000, '마스크 블러 확장', 'inpaint', 'route=inpaint'],
  ['sharpness', [], 'float', 0, 30, '선명도', 'advanced', 'advanced'],
  ['clip_weight', [], 'float', 0, 1, 'CLIP 가중치', 'imagePrior', 'cap=imagePrior'],
  ['negative_prompt_for_image_prior', [], 'bool', null, null, '이미지 Prior에 네거티브 적용', 'imagePrior', 'cap=imagePrior'],
  ['image_prior_steps', [], 'int', 3, 60, '이미지 Prior 스텝', 'imagePrior', 'cap=imagePrior'],
  ['prompt', [], 'string', null, null, '프롬프트', 'prompt', 'composer'],
  ['negative_prompt', [], 'string', null, null, '네거티브 프롬프트', 'prompt', 'composer'],
  ['hires_fix', ['enable_hr'], 'bool', null, null, '고해상도 보정', 'hires', 'always'],
  ['hires_fix_width', ['firstphase_width'], 'int', 128, 2048, '1차 패스 너비', 'hires', 'hires_fix=true', ['step64']],
  ['hires_fix_height', ['firstphase_height'], 'int', 128, 2048, '1차 패스 높이', 'hires', 'hires_fix=true', ['step64']],
  ['hires_fix_strength', [], 'float', 0, 1, '2차 패스 강도', 'hires', 'hires_fix=true'],
  ['tiled_decoding', [], 'bool', null, null, '타일 디코딩', 'tileDecode', 'advanced'],
  ['decoding_tile_width', [], 'int', 128, 2048, '디코딩 타일 너비', 'tileDecode', 'tiled_decoding=true', ['step64']],
  ['decoding_tile_height', [], 'int', 128, 2048, '디코딩 타일 높이', 'tileDecode', 'tiled_decoding=true', ['step64']],
  ['decoding_tile_overlap', [], 'int', 64, 1024, '디코딩 타일 겹침', 'tileDecode', 'tiled_decoding=true', ['step64']],
  ['original_width', [], 'int', 128, 2048, '원본 너비', 'sdxl', 'cap=sdxl'],
  ['original_height', [], 'int', 128, 2048, '원본 높이', 'sdxl', 'cap=sdxl'],
  ['crop_top', [], 'int', 0, 1024, '위쪽 크롭', 'sdxl', 'cap=sdxl'],
  ['crop_left', [], 'int', 0, 1024, '왼쪽 크롭', 'sdxl', 'cap=sdxl'],
  ['target_width', [], 'int', 128, 2048, '목표 너비', 'sdxl', 'cap=sdxl'],
  ['target_height', [], 'int', 128, 2048, '목표 높이', 'sdxl', 'cap=sdxl'],
  ['negative_original_width', [], 'int', 128, 2048, '네거티브 원본 너비', 'sdxl', 'cap=sdxl'],
  ['negative_original_height', [], 'int', 128, 2048, '네거티브 원본 높이', 'sdxl', 'cap=sdxl'],
  ['aesthetic_score', [], 'float', 0, 10, '미적 점수', 'sdxl', 'cap=sdxl'],
  ['negative_aesthetic_score', [], 'float', 0, 10, '네거티브 미적 점수', 'sdxl', 'cap=sdxl'],
  ['zero_negative_prompt', [], 'bool', null, null, '빈 네거티브 임베딩 제로화', 'sdxl', 'cap=sdxl'],
  ['refiner_model', [], 'string', null, null, '리파이너 모델', 'refiner', 'advanced'],
  ['refiner_start', [], 'float', 0, 1, '리파이너 시작 지점', 'refiner', 'refiner_model!='],
  ['num_frames', [], 'int', 1, 201, '프레임 수', 'video', 'cap=video'],
  ['fps', [], 'int', 1, 30, 'FPS', 'video', 'cap=video'],
  ['motion_scale', [], 'int', 0, 255, '모션 스케일', 'video', 'cap=video'],
  ['guiding_frame_noise', [], 'float', 0, 1, '가이드 프레임 노이즈', 'video', 'cap=video'],
  ['start_frame_guidance', [], 'float', 0, 25, '시작 프레임 가이던스', 'video', 'cap=video'],
  ['shift', [], 'float', 0.1, 8, '시프트', 'sampling', 'advanced'],
  ['stage_2_guidance', [], 'float', 0, 25, '2단계 CFG', 'stage2', 'cap=stage2'],
  ['stage_2_shift', [], 'float', 0.1, 5, '2단계 시프트', 'stage2', 'cap=stage2'],
  ['loras', [], 'loras', null, null, 'LoRA', 'conditioning', 'always'],
  ['controls', [], 'controls', null, null, 'ControlNet', 'conditioning', 'always'],
  ['stochastic_sampling_gamma', [], 'float', 0, 1, '확률적 샘플링 감마', 'sampling', 'advanced'],
  ['preserve_original_after_inpaint', [], 'bool', null, null, '인페인트 후 원본 보존', 'inpaint', 'route=inpaint'],
  ['tiled_diffusion', [], 'bool', null, null, '타일 확산', 'tileDiffusion', 'advanced'],
  ['diffusion_tile_width', [], 'int', 128, 2048, '확산 타일 너비', 'tileDiffusion', 'tiled_diffusion=true', ['step64']],
  ['diffusion_tile_height', [], 'int', 128, 2048, '확산 타일 높이', 'tileDiffusion', 'tiled_diffusion=true', ['step64']],
  ['diffusion_tile_overlap', [], 'int', 64, 1024, '확산 타일 겹침', 'tileDiffusion', 'tiled_diffusion=true', ['step64']],
  ['upscaler', [], 'string', null, null, '업스케일러', 'upscale', 'advanced'],
  ['upscaler_scale', ['upscaler_scale_factor'], 'int', 0, 4, '업스케일 배율', 'upscale', 'upscaler!='],
  ['t5_text_encoder_decoding', [], 'bool', null, null, 'T5 텍스트 인코더 사용', 'textEncoder', 'advanced'],
  ['separate_clip_l', [], 'bool', null, null, 'CLIP-L 프롬프트 분리', 'textEncoder', 'advanced'],
  ['clip_l_text', [], 'string', null, null, 'CLIP-L 프롬프트', 'textEncoder', 'separate_clip_l=true'],
  ['separate_open_clip_g', [], 'bool', null, null, 'OpenCLIP-G 프롬프트 분리', 'textEncoder', 'advanced'],
  ['open_clip_g_text', [], 'string', null, null, 'OpenCLIP-G 프롬프트', 'textEncoder', 'separate_open_clip_g=true'],
  ['speed_up_with_guidance_embed', [], 'bool', null, null, '가이던스 임베드 가속', 'guidanceEmbed', 'advanced'],
  ['guidance_embed', [], 'float', 0, 25, '가이던스 임베드', 'guidanceEmbed', 'speed_up_with_guidance_embed=true'],
  ['resolution_dependent_shift', [], 'bool', null, null, '해상도 의존 시프트', 'sampling', 'advanced'],
  ['tea_cache_start', [], 'int', 0, 1000, 'TeaCache 시작 스텝', 'teaCache', 'tea_cache=true'],
  ['tea_cache_end', [], 'int', 0, 1000, 'TeaCache 종료 스텝', 'teaCache', 'tea_cache=true', ['minusOneOmit']],
  ['tea_cache_threshold', [], 'float', 0, 1, 'TeaCache 임계값', 'teaCache', 'tea_cache=true'],
  ['tea_cache_max_skip_steps', [], 'int', 1, 1000, 'TeaCache 최대 건너뛸 스텝', 'teaCache', 'tea_cache=true'],
  ['tea_cache', [], 'bool', null, null, 'TeaCache', 'teaCache', 'advanced'],
  ['separate_t5', [], 'bool', null, null, 'T5 프롬프트 분리', 'textEncoder', 'advanced', ['upstreamDefaultBug']],
  ['t5_text', [], 'string', null, null, 'T5 프롬프트', 'textEncoder', 'separate_t5=true', ['upstreamDefaultBug']],
  ['causal_inference', [], 'int', 0, 1000, '인과 추론 크기', 'causal', 'advanced'],
  ['causal_inference_pad', [], 'int', 0, 1000, '인과 추론 패딩', 'causal', 'causal_inference>0'],
  ['cfg_zero_star', [], 'bool', null, null, 'CFG-Zero*', 'guidance', 'advanced'],
  ['cfg_zero_init_steps', [], 'int', 0, 1000, 'CFG-Zero 초기 스텝', 'guidance', 'cfg_zero_star=true'],
  ['compression_artifacts', ['compression_artifacts'], 'enum:compression', null, null, '압축 아티팩트', 'postprocess', 'advanced', ['httpBroken']],
  ['compression_artifacts_quality', ['compression_artifacts_quality'], 'float', 0, 100, '압축 품질', 'postprocess', 'compression_artifacts!=disabled', ['httpBroken']],
  ['color_calibration', ['color_calibration'], 'enum:color', null, null, '색상 보정', 'postprocess', 'advanced', ['httpBroken']],
  ['expand_prompt_to_json', ['expand_prompt_to_json'], 'bool', null, null, '프롬프트를 JSON으로 확장', 'prompt', 'advanced', ['httpBroken']],
  ['restore_faces', [], 'bool', null, null, '얼굴 복원', 'postprocess', 'always', ['specialHttp']],
] as const

function kindAndEnum(rawKind: string): Pick<ParameterDefinition, 'kind' | 'enumValues'> {
  if (!rawKind.startsWith('enum:')) return { kind: rawKind as ParameterKind }
  const enumName = rawKind.slice(5) as keyof typeof E
  return { kind: 'enum', enumValues: E[enumName] }
}

export const PARAMETER_DEFINITIONS: ParameterDefinition[] = RAW_PARAMETERS.map(
  ([key, aliases, rawKind, min, max, label, group, when, flags = []]) => ({
    key,
    aliases: [...aliases],
    ...kindAndEnum(rawKind),
    ...(min === null ? {} : { min }),
    ...(max === null ? {} : { max }),
    label,
    group,
    when,
    step: flags.includes('step64') ? 64 : rawKind === 'float' ? 0.05 : 1,
    readOnlyReason: flags.includes('httpBroken')
      ? 'Draw Things 1.20260716.0의 중복 JSON 별칭 버그로 HTTP 요청 시 422가 발생해 현재 읽기 전용입니다.'
      : undefined,
    sourceNote: flags.includes('upstreamDefaultBug')
      ? '현재 앱 소스에서 기본값 참조가 잘못되어 연결 후 서버 값을 우선 사용합니다.'
      : flags.includes('minusOneOmit')
        ? '앱 기본값 -1은 HTTP 검증 범위 밖이므로 -1일 때 요청에서 생략합니다.'
        : flags.includes('specialHttp')
          ? 'HTTP API 전용 필드이며 활성화하면 앱에 설치된 첫 얼굴 복원 모델을 사용합니다.'
          : undefined,
  }),
)

export function isParameterVisible(
  definition: ParameterDefinition,
  values: GenerationParameters,
  mode: GenerationMode,
) {
  const { when } = definition
  if (when === 'composer') return false
  if (when === 'route=img2img' || when === 'route=inpaint') return mode === 'img2img'
  if (when.endsWith('=true')) {
    const key = when.slice(0, -5)
    return values[key] === true
  }
  if (when.endsWith('>0')) {
    const key = when.slice(0, -2)
    return Number(values[key] ?? 0) > 0
  }
  if (when.endsWith('!=')) {
    const key = when.slice(0, -2)
    return Boolean(values[key])
  }
  if (when.includes('!=disabled')) {
    const key = when.split('!=')[0] ?? ''
    return values[key] !== 'disabled'
  }
  return true
}

const HTTP_UNWRITABLE = new Set([
  'compression_artifacts',
  'compression_artifacts_quality',
  'color_calibration',
  'expand_prompt_to_json',
])

export function sanitizeHttpParameters(parameters: GenerationParameters) {
  const safe: Record<string, ParameterValue> = {}
  for (const [key, value] of Object.entries(parameters)) {
    if (HTTP_UNWRITABLE.has(key)) continue
    if (key === 'tea_cache_end' && Number(value) < 0) continue
    safe[key] = value
  }
  return safe
}

export interface DrawThingsLoRA {
  file?: string | null
  weight: number
  mode?: 'all' | 'base' | 'refiner' | string | null
}

export interface DrawThingsControl {
  file?: string | null
  weight: number
  guidanceStart: number
  guidanceEnd: number
  noPrompt: boolean
  globalAveragePooling: boolean
  downSamplingRate: number
  controlImportance: string
  inputOverride: string
  targetBlocks: string[]
}

export const EMPTY_LORA: DrawThingsLoRA = { file: '', weight: 0.6, mode: 'all' }
export const EMPTY_CONTROL: DrawThingsControl = {
  file: '',
  weight: 1,
  guidanceStart: 0,
  guidanceEnd: 1,
  noPrompt: false,
  globalAveragePooling: true,
  downSamplingRate: 1,
  controlImportance: 'balanced',
  inputOverride: '',
  targetBlocks: [],
}
