# Draw Things Local Canvas

Draw Things macOS의 로컬 API를 브라우저에서 사용하는 로컬 우선 AI 이미지 캔버스입니다. 웹 앱은 Vercel 같은 정적 호스팅에 둘 수 있지만, 프롬프트와 생성 이미지는 방문자의 브라우저와 그 Mac에서 실행 중인 Draw Things 사이에서만 이동합니다.

이 프로젝트의 API 매핑과 제약은 Draw Things `v1.20260716.0` (`64646d1202441d6abe17498caa02316669c3fc31`)을 기준으로 확인했습니다. Draw Things 공식 제품이나 공식 웹 클라이언트는 아닙니다.

## 핵심 기능

- 여러 로컬 세션을 가진 무한 캔버스: 이동, 확대/축소, 전체 맞춤, 이미지 가져오기
- Draw Things HTTP API를 통한 `txt2img`와 `img2img`
- 선택한 캔버스 이미지를 다음 생성의 입력 이미지로 사용하는 변형 흐름
- 같은 세션의 이전 프롬프트를 이어 붙이는 클라이언트 측 대화 문맥
- Draw Things 소스에서 확인한 HTTP 생성 파라미터 83개와 HTTP 전용 `restore_faces` 처리
- 모델, 샘플링, 배치, SDXL, refiner, 고해상도 보정, 타일링, 비디오, LoRA, Control, 업스케일, 텍스트 인코더, TeaCache, CFG 등 범주별 전체 설정 UI
- 로컬에 실제 설치된 주 모델을 이름과 파일명으로 보여 주는 모델·refiner 드롭다운과 즉시 새로고침
- 연결 직전 검사와 지속적인 상태 감시
- HTTP·gRPC, 호스트, 포트, TLS, 공유 비밀, API base path, 커넥터 주소를 포함한 연결 설정
- 로컬 커넥터를 통한 루프백 자동 탐색과 gRPC Echo·모델 메타데이터 진단
- 모든 설정·세션·이미지의 브라우저 로컬 저장

## 아키텍처

```mermaid
flowchart LR
    V["Vercel\n정적 웹 앱"] -->|HTML / JS / CSS만 제공| B["방문자의 브라우저"]
    B -->|"localhost:47821\nCORS + PNA"| C["로컬 커넥터\nNode.js"]
    C -->|"127.0.0.1:7859\nHTTP 또는 gRPC Echo"| D["Draw Things macOS"]
    B --- S["localStorage\nsessionStorage\nIndexedDB"]
```

Vercel 서버가 방문자의 `localhost`에 접속하는 구조가 아닙니다. 브라우저가 방문자 Mac의 루프백 커넥터에 직접 요청하고, 커넥터가 허용된 Draw Things API 경로만 중계합니다. 따라서 캔버스를 사용할 때 Draw Things와 커넥터가 모두 같은 Mac에서 실행 중이어야 합니다.

기본 Draw Things 서버에는 브라우저용 CORS 응답이 없고 네이티브 gRPC도 브라우저에서 직접 호출할 수 없으므로, 배포 환경에서는 로컬 커넥터 사용을 권장합니다.

## 요구 사항

- macOS와 Draw Things `v1.20260716.0` 또는 호환 버전
- Node.js `22.12.0` 이상
- pnpm `10.33.0`
- 로컬 네트워크 접근을 허용할 수 있는 최신 브라우저

Node와 pnpm 버전을 확인합니다.

```sh
node --version
pnpm --version
```

## 로컬 개발 빠른 시작

### 1. 의존성 설치

```sh
pnpm install --frozen-lockfile
```

### 2. Draw Things HTTP 서버 설정

Draw Things의 설정에서 API 서버를 다음과 같이 맞춥니다.

| Draw Things 옵션 | 캔버스 생성용 권장값 | 설명 |
| --- | --- | --- |
| API 서버 | 켬 / Online | 꺼지면 웹 앱이 즉시 연결 끊김으로 표시합니다. |
| 프로토콜 | `HTTP` | 웹 캔버스의 실제 이미지 생성에 필수입니다. |
| IP | `127.0.0.1` | 가능하면 루프백만 사용합니다. `0.0.0.0`은 LAN에도 노출될 수 있습니다. |
| 포트 | `7859` | 다른 포트도 지원하지만 웹 설정과 동일해야 합니다. |
| TLS | 끔 | 내장 HTTP API의 기본 구성입니다. |
| 공유 비밀 | 해당 없음 | 공유 비밀은 gRPC Echo·모델 탐색 진단에서 사용합니다. |
| 브리지 모드 | 보통 끔 | Draw Things의 서버 오프로딩 기능이며 이 프로젝트의 로컬 커넥터와 다른 개념입니다. |
| 응답 압축 | 선택 | gRPC 진단 시 gzip 응답을 커넥터가 처리합니다. HTTP 생성에는 영향이 없습니다. |
| 모델 탐색 | 선택 | gRPC Echo 메타데이터 진단에만 사용됩니다. |

Draw Things를 `0.0.0.0`에 바인딩해도 웹 앱과 커넥터에는 호스트 `127.0.0.1`을 입력할 수 있습니다. 다만 이 경우 Draw Things 자체가 다른 네트워크 인터페이스에도 노출될 수 있으므로 macOS 방화벽을 함께 확인하십시오.

### 3. 웹 개발 서버 실행

터미널 하나에서 다음을 실행합니다.

```sh
pnpm dev
```

기본 주소는 `http://127.0.0.1:5173`입니다.

### 4. 로컬 커넥터 실행

다른 터미널에서 다음을 실행합니다.

```sh
pnpm bridge
```

개발 모드에서 `--origin`을 생략하면 정확히 다음 origin만 허용합니다.

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://[::1]:5173`
- 같은 호스트의 Vite preview 포트 `4173`

커넥터는 기본적으로 `http://127.0.0.1:47821`에만 바인딩합니다. `0.0.0.0`이나 LAN 주소로 커넥터를 열 수 없습니다.

### 5. 웹에서 연결

웹 앱의 **Draw Things 연결** 화면에서 다음 값을 선택합니다.

1. 연결 경로: `로컬 커넥터`
2. Draw Things 프로토콜: `HTTP`
3. 호스트: `127.0.0.1`
4. 포트: `7859` 또는 Draw Things에서 선택한 포트
5. 커넥터 주소: `http://127.0.0.1:47821`
6. **연결 테스트** 후 **이 설정 사용**

**자동 찾기**는 입력한 포트와 기본 포트 `7859`에서 평문 HTTP, TLS gRPC, h2c gRPC를 병렬로 점검합니다. Bonjour로 앱을 실행하거나 시스템 설정을 변경하지는 않습니다.

## Tailscale로 모바일에서 접속

모바일과 Mac이 같은 tailnet에 연결되어 있으면 물리 LAN 전체가 아닌 **이 Mac의 실제 Tailscale IP에만** 웹 미리보기와 커넥터를 바인딩할 수 있습니다. `0.0.0.0`은 Wi-Fi·유선 LAN에도 노출되므로 사용하지 않습니다.

macOS 앱 번들에서 현재 Tailscale IPv4를 확인하고 프로덕션 빌드를 만듭니다.

```sh
/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4
pnpm build
```

터미널 하나에서 빌드 결과를 Tailscale IP의 5173 포트에만 엽니다.

```sh
DRAW_THINGS_TAILSCALE_IP=$(/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4)
pnpm exec vite preview \
  --host "$DRAW_THINGS_TAILSCALE_IP" \
  --port 5173 \
  --strictPort
```

다른 터미널에서 웹 origin과 충분히 긴 페어링 토큰을 지정해 커넥터를 실행합니다.

```sh
DRAW_THINGS_TAILSCALE_IP=$(/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4)
node public/bridge/draw-things-bridge.mjs \
  --bind "$DRAW_THINGS_TAILSCALE_IP" \
  --origin "http://$DRAW_THINGS_TAILSCALE_IP:5173" \
  --token '<64자리-무작위-16진수-토큰>'
```

모바일에서 `http://<Mac의-Tailscale-IP>:5173`을 열고 다음처럼 연결합니다.

| 모바일 연결 값 | 설정 |
| --- | --- |
| 연결 경로 | `로컬 커넥터` |
| Draw Things 프로토콜 | `HTTP` |
| Draw Things 호스트 | `127.0.0.1` — 모바일 주소로 바꾸지 않음 |
| Draw Things 포트 | Mac의 Draw Things API 포트 |
| 커넥터 주소 | `http://<Mac의-Tailscale-IP>:47821` |
| 커넥터 페어링 토큰 | 위 `--token`과 동일한 값 |

Tailscale 주소로 처음 열면 커넥터 주소와 `--bind` 실행 명령을 UI가 자동 제안합니다. 모바일 origin의 Local Storage·IndexedDB는 Mac의 `127.0.0.1:5173`과 별개이므로 연결 설정과 캔버스도 따로 저장됩니다. 제한적인 tailnet 정책을 사용한다면 해당 모바일 기기에서 Mac의 TCP `5173`, `47821` 접근을 허용해야 합니다. 인터넷 공유기 포트 포워딩은 필요하지 않습니다.

## 배포용 커넥터

배포 빌드에는 단일 실행 파일 `dist/bridge/draw-things-bridge.mjs`가 포함됩니다. 소스 트리에서는 다음 명령으로 갱신합니다.

```sh
pnpm bridge:build
```

배포된 웹 앱의 연결 화면에서 커넥터를 다운로드하거나 다음과 같이 저장할 수 있습니다.

```sh
curl -fLo ~/Downloads/draw-things-bridge.mjs https://your-site.vercel.app/bridge/draw-things-bridge.mjs
```

운영 사이트의 정확한 origin을 허용해 실행합니다. URL 끝에 경로나 `/`를 붙이지 않습니다.

```sh
node ~/Downloads/draw-things-bridge.mjs \
  --origin https://your-site.vercel.app
```

Vercel preview URL과 운영 URL을 모두 사용할 때는 `--origin`을 반복합니다.

```sh
node ~/Downloads/draw-things-bridge.mjs \
  --origin https://your-site.vercel.app \
  --origin https://your-preview.vercel.app
```

origin은 와일드카드를 지원하지 않습니다. 새 preview URL이 생기면 해당 origin을 추가하고 커넥터를 다시 실행해야 합니다.

### 페어링 토큰

정확한 origin 제한만으로도 다른 웹사이트의 접근을 차단하지만, 운영 환경에서는 페어링 토큰을 함께 사용하는 것을 권장합니다. 웹 연결 화면의 **실행 명령 복사**는 강한 무작위 토큰을 자동으로 포함합니다.

```sh
node ~/Downloads/draw-things-bridge.mjs \
  --origin https://your-site.vercel.app \
  --token '<긴-랜덤-토큰>'
```

웹 연결 설정의 커넥터 페어링 토큰 값도 동일해야 합니다. 커넥터는 `Authorization: Bearer`, `X-Draw-Things-Bridge-Token`, `X-Draw-Things-Pairing-Token`을 지원합니다. 토큰은 최소 6자이지만 충분히 긴 무작위 값을 권장합니다.

전체 CLI 옵션은 다음 명령으로 확인합니다.

```sh
node ~/Downloads/draw-things-bridge.mjs --help
```

Draw Things의 **외부 모델 폴더**를 사용하면 읽을 폴더를 커넥터에 명시합니다. 이 경로는 웹 앱에 저장되거나 전송되지 않고 해당 커넥터 프로세스만 읽습니다. 옵션은 여러 번 지정할 수 있습니다.

```sh
node ~/Downloads/draw-things-bridge.mjs \
  --origin https://your-site.vercel.app \
  --token '<긴-랜덤-토큰>' \
  --models-dir '/Volumes/AI Models/Draw Things'
```

## Vercel 배포

이 프로젝트는 서버 함수가 없는 Vite 정적 앱입니다. `vercel.json`에 SPA rewrite와 CSP·보안 헤더가 포함되어 있습니다.

Vercel 프로젝트 설정은 다음과 같습니다.

| 항목 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm build` |
| Output Directory | `dist` |
| Node.js | `22.12.0` 이상 |

Vercel CLI로 배포하려면 다음을 실행합니다.

```sh
pnpm dlx vercel
pnpm dlx vercel --prod
```

배포 후에는 최종 도메인을 커넥터의 `--origin`에 정확히 넣어 다시 실행하십시오. 커넥터 자체는 Vercel에 배포하지 않으며 각 사용자의 Mac에서 실행합니다.

## 연결 옵션과 동작

| 옵션 | 지원 범위 |
| --- | --- |
| 로컬 커넥터 | 권장 경로. Vercel HTTPS 페이지와 Draw Things 루프백 API 사이를 중계합니다. |
| 직접 연결 | CORS를 추가한 사용자 프록시나 수정된 HTTP 서버에서만 실용적으로 동작합니다. Vercel HTTPS 배포에서는 혼합 콘텐츠 정책상 사용자 프록시도 HTTPS여야 합니다. 기본 Draw Things에서는 실패합니다. |
| HTTP | 연결 검사, `/sdapi/v1/options`, `txt2img`, `img2img`를 지원합니다. |
| gRPC | 커넥터를 통한 TLS/h2c Echo, 공유 비밀, gzip 응답, 모델·LoRA·ControlNet·텍스트 임베딩·업스케일러 메타데이터 진단을 지원합니다. 이미지 생성은 지원하지 않습니다. |
| 호스트 | 커넥터 경로는 `localhost`, `127.0.0.1`, `::1`만 허용합니다. 직접 연결은 사용자 지정 프록시 주소를 입력할 수 있습니다. |
| 포트 | `1`–`65535`. Draw Things 기본값은 `7859`, 커넥터 기본값은 `47821`입니다. |
| TLS | gRPC 또는 사용자 HTTPS 프록시 진단에 사용합니다. Draw Things 자체 서명 인증서는 커넥터 안에서만 처리됩니다. |
| 공유 비밀 | Draw Things gRPC에서 공유 비밀을 켠 경우 동일 값을 입력합니다. HTTP 생성 인증 수단은 아닙니다. |
| API Base Path | 기본 Draw Things에서는 비워 둡니다. 경로 prefix가 있는 사용자 프록시에서만 사용합니다. |
| 클라이언트 이름 | gRPC Echo의 클라이언트 식별 값입니다. |
| 앱 서버 기대값 | Draw Things의 브리지 모드, 응답 압축, 모델 탐색 설정을 기록하는 UI 값입니다. 웹 앱이 Draw Things 설정을 원격으로 켜거나 끄지는 않습니다. |

브라우저 보안 정책 때문에 로컬 네트워크 권한 안내가 나타날 수 있습니다. 권한을 거부하면 `CORS/TLS/로컬 네트워크 차단` 상태로 표시됩니다. 브라우저 설정에서 이 사이트의 로컬 네트워크 권한을 허용한 뒤 다시 테스트하십시오.

## 연결 상태 감시

- 저장된 Draw Things 연결은 화면이 보일 때 5초마다 검사합니다.
- 백그라운드 탭에서는 25초마다 검사합니다.
- 탭이 다시 보이면 즉시 한 번 더 검사합니다.
- 이미지 생성 직전에도 반드시 실시간 연결 검사를 수행합니다.
- 생성 중에는 긴 작업과 충돌하지 않도록 일반 heartbeat를 잠시 멈춥니다.
- 로컬 커넥터 자체의 health는 별도로 5초마다 확인합니다.
- 일반 연결 실패가 누적되면 `degraded`에서 `offline`으로 바뀌며, API 불일치와 CORS/TLS 차단은 즉시 구분합니다.

새 연결을 저장한 뒤 처음 받은 `/sdapi/v1/options` 응답을 한 번만 로컬 UI에 병합합니다. 이후 heartbeat는 사용자가 바꾼 생성값을 덮지 않습니다.

## 이미지 생성과 세션 문맥

HTTP 모드에서 프롬프트와 네거티브 프롬프트는 Draw Things의 `txt2img` 또는 `img2img` 요청으로 전달됩니다. 캔버스에서 이미지를 선택하고 **선택 이미지로 변형**을 켜면 선택 이미지의 원본 크기와 base64 데이터를 `init_images`로 전송합니다.

대화 문맥은 Draw Things 서버 세션이 아니라 이 웹 앱의 로컬 기능입니다.

- **대화 문맥 이어짐**이 켜져 있으면 같은 캔버스 세션의 직전 유효 프롬프트 뒤에 새 입력을 붙입니다.
- 프롬프트를 `!`로 시작하면 그 요청에서만 이전 문맥을 제외합니다.
- 다른 캔버스 세션의 문맥은 섞이지 않습니다.
- 요청·응답 상태와 생성 이미지 lineage는 해당 로컬 세션에 기록됩니다.

## 설치 모델 목록과 모델 설치

Draw Things의 HTTP `/sdapi/v1/options`는 현재 선택된 모델 하나만 반환합니다. 전체 드롭다운이 필요할 때 로컬 커넥터는 Draw Things의 `custom.json`, 공식·비공식 모델 카탈로그를 읽고, 주 모델 파일이 실제로 존재하며 비어 있지 않은 항목만 병합합니다. VAE·CLIP·T5 같은 의존 파일은 생성 모델 목록에서 제외하며 절대 로컬 경로는 브라우저에 보내지 않습니다. gRPC와 모델 탐색이 켜진 환경에서는 Echo의 모델 메타데이터도 함께 병합합니다.

현재 공개 HTTP API에는 모델 검색·다운로드·변환·설치·삭제 경로가 없습니다. gRPC `UploadFile`은 이미 호환되는 파일을 해시 검증하며 동기화하는 저수준 RPC로, safetensors 변환이나 모델 메타데이터·의존 파일 설치를 처리하는 일반 모델 설치 API가 아닙니다. 새 모델은 Draw Things의 **모델 관리/가져오기**에서 설치한 뒤 웹 앱의 모델 새로고침을 누르십시오.

## 로컬 데이터와 개인정보 보호

이 프로젝트에는 사용자 프롬프트나 이미지를 받는 애플리케이션 백엔드, 계정, 쿠키, 분석 SDK가 없습니다.

| 저장소 | 저장 내용 |
| --- | --- |
| `localStorage` | 연결 설정, 생성 설정, 네거티브 프롬프트, UI 설정, 활성 세션 ID. `기억`을 켠 공유 비밀과 페어링 토큰도 포함될 수 있습니다. |
| `sessionStorage` | `기억`을 끈 공유 비밀. 현재 탭 세션 동안만 유지됩니다. |
| `IndexedDB` | 캔버스 세션·대화·위치 메타데이터와 가져온/생성 이미지 data URL을 분리된 object store에 저장합니다. |
| 메모리 | 진행 중 요청과 미리보기 상태. |

브라우저 저장소는 암호화 금고가 아닙니다. 같은 브라우저 프로필을 사용할 수 있는 사람과 권한이 강한 브라우저 확장은 값을 읽을 수 있습니다. 민감한 공유 비밀은 **이 브라우저에 기억**을 끄고, 공용 Mac에서는 사용 후 해당 사이트의 브라우저 데이터를 삭제하십시오.

세션 삭제 버튼은 해당 세션과 이미지를 IndexedDB에서 함께 삭제합니다. 전체 데이터를 지우려면 브라우저의 해당 사이트 저장 데이터에서 Local Storage와 IndexedDB를 삭제하십시오.

## 로컬 커넥터 보안 모델

커넥터는 범용 프록시가 되지 않도록 다음을 강제합니다.

- 기본은 `127.0.0.1`에만 listen; 원격 모드는 명시한 Tailscale IPv4/IPv6만 허용
- Tailscale bind에서는 명시적 origin과 32자 이상 페어링 토큰 필수
- 요청 `Host`가 실제 커넥터 bind 주소와 포트인지 검증
- Draw Things 대상도 `localhost`, `127.0.0.1`, `::1`로 제한
- 정확히 일치하는 origin만 CORS 허용; 와일드카드 없음
- Private Network Access preflight 응답 지원
- 정해진 `/v1/*` 라우트와 HTTP method만 허용
- 선택적 페어링 토큰을 상수 시간 비교로 검증
- 제어 요청 256 KiB, 생성 요청 128 MiB, upstream 응답 512 MiB 제한
- JSON prototype 오염 키와 과도한 중첩 거부
- 연결·생성 timeout 및 동시 연결 제한
- 오류 응답에서 공유 비밀을 제거

운영 사이트의 코드가 바뀌면 그 사이트는 사용자의 로컬 커넥터에 요청할 수 있습니다. 신뢰하는 배포만 `--origin`에 추가하고, 가능하면 자신의 Vercel 프로젝트에 배포해 사용하십시오.

## 중요한 API 한계

### 브라우저와 Vercel

- 원격 Vercel 서버는 방문자 Mac의 `localhost`에 도달할 수 없습니다.
- 기본 Draw Things HTTP 서버는 CORS preflight를 제공하지 않습니다.
- `mode: no-cors` 요청으로는 JSON 이미지 응답을 읽을 수 없으므로 해결책이 아닙니다.
- 웹 앱이 Draw Things를 실행하거나 macOS 설정을 자동 변경할 수 없습니다. 자동 연결은 실행 중인 커넥터와 알려진 루프백 포트를 탐색하는 범위입니다.

### HTTP 생성

Draw Things `v1.20260716.0`의 공개 HTTP surface는 사실상 다음 네 경로입니다.

- `GET /`
- `GET /sdapi/v1/options`
- `POST /sdapi/v1/txt2img`
- `POST /sdapi/v1/img2img`

생성 요청은 동기식입니다. 서버가 실제 단계별 진행률, 중간 미리보기, 서버 측 취소 API를 제공하지 않습니다. 커넥터의 진행 표시는 연결이 살아 있음을 알리는 heartbeat이며 실제 diffusion 진행률이 아닙니다. 중단 버튼은 브라우저와 커넥터의 요청을 끊지만 Draw Things 내부 생성 작업은 완료될 때까지 계속될 수 있습니다.

HTTP `img2img`는 `init_images` 한 장만 받으며 입력 이미지 크기가 `width`와 `height`에 정확히 일치해야 합니다. HTTP 경로에는 마스크 업로드가 없어 실제 mask inpaint는 지원하지 않습니다. 텍스트 생성 크기는 Draw Things 블록 크기에 맞춰 64의 배수로 제한합니다.

### gRPC

브라우저는 Draw Things의 네이티브 HTTP/2 gRPC와 직접 통신할 수 없습니다. 로컬 커넥터는 `ImageGenerationService/Echo`를 사용한 연결·TLS·공유 비밀·모델 탐색 진단까지 지원합니다.

gRPC 이미지 생성 요청은 FlatBuffer 설정을 사용하고 결과는 Draw Things/NNC 전용 tensor payload로 반환됩니다. 현재 JavaScript 커넥터에는 이 tensor codec이 없으므로 gRPC 이미지 생성을 광고하지 않습니다. 캔버스에서 이미지를 만들려면 Draw Things API 서버를 `HTTP`로 전환해야 합니다.

## `v1.20260716.0`에서 확인한 upstream API 문제

웹 앱은 다음 문제를 숨기지 않고 UI 또는 요청 sanitizer에서 우회합니다.

| 필드/기능 | upstream 동작 | 이 프로젝트의 처리 |
| --- | --- | --- |
| `stage_2_steps` | 파라미터 객체는 존재하지만 `allParameters()` 목록에서 빠져 있어 HTTP JSON으로 보내면 422가 발생합니다. | UI와 요청에서 제외합니다. |
| `compression_artifacts` | canonical key와 alias가 중복되어 HTTP decode가 422를 반환합니다. | 읽기 전용으로 표시하고 요청에서 제거합니다. |
| `compression_artifacts_quality` | 같은 중복 alias 문제로 422가 발생합니다. | 읽기 전용으로 표시하고 요청에서 제거합니다. |
| `color_calibration` | 같은 중복 alias 문제로 422가 발생합니다. | 읽기 전용으로 표시하고 요청에서 제거합니다. |
| `expand_prompt_to_json` | 같은 중복 alias 문제로 422가 발생합니다. | 읽기 전용으로 표시하고 요청에서 제거합니다. |
| `tea_cache_end` | options 기본값은 `-1`인데 HTTP validator는 `0...1000`만 허용합니다. | 값이 음수이면 요청에서 생략합니다. |
| `separate_t5`, `t5_text` | 소스의 기본값 참조가 다른 필드를 가리키는 문제가 있습니다. | 연결 후 `/options`에서 받은 서버 값을 우선합니다. |
| `restore_faces` | 일반 `allParameters()` 항목이 아닌 HTTP 요청 전용 bool입니다. | 별도 옵션으로 제공하며 켜면 설치된 첫 얼굴 복원 모델을 사용합니다. |
| mask inpaint | HTTP 서버가 mask 이미지를 decode하지 않습니다. | 지원하지 않는 것으로 명시합니다. |

Draw Things 버전을 올린 뒤 이 문제가 수정되었다면 `src/lib/draw-things/parameters.ts`의 호환 처리와 테스트를 함께 갱신해야 합니다.

## 테스트와 품질 검사

개발 중 빠른 단위 테스트 watch:

```sh
pnpm test
```

개별 검사:

```sh
pnpm lint
pnpm typecheck
pnpm test:run
pnpm bridge:build
pnpm build
```

전체 정적 검사·단위 테스트·프로덕션 빌드:

```sh
pnpm check
```

브라우저 E2E 테스트를 처음 실행하기 전 Chromium을 설치합니다.

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

커넥터 테스트에는 origin·토큰·Private Network Access, body 제한, 루프백 host 제한, HTTP/gRPC probe와 protocol frame 처리가 포함됩니다. 실제 이미지 생성 품질과 모델 호환성은 사용자의 Draw Things 버전과 설치 모델에 따라 달라지므로 실제 앱에서도 최종 확인해야 합니다.

## 공식 기준 소스

아래 링크는 문서 작성 당시 검증한 release와 정확한 commit에 고정되어 있습니다.

- [Draw Things Community release `v1.20260716.0`](https://github.com/drawthingsai/draw-things-community/releases/tag/v1.20260716.0)
- [기준 commit `64646d1202441d6abe17498caa02316669c3fc31`](https://github.com/drawthingsai/draw-things-community/commit/64646d1202441d6abe17498caa02316669c3fc31)
- [HTTP route와 txt2img/img2img 처리 — `HTTPAPIServer.swift`](https://github.com/drawthingsai/draw-things-community/blob/64646d1202441d6abe17498caa02316669c3fc31/Libraries/HTTPAPIServer/Sources/HTTPAPIServer.swift)
- [HTTP request/response decode — `ServerModels.swift`](https://github.com/drawthingsai/draw-things-community/blob/64646d1202441d6abe17498caa02316669c3fc31/Libraries/HTTPAPIServer/Sources/ServerModels.swift)
- [파라미터 정의와 `allParameters()` — `Parameters.swift`](https://github.com/drawthingsai/draw-things-community/blob/64646d1202441d6abe17498caa02316669c3fc31/Libraries/Invocation/Sources/Parameters.swift)
- [gRPC service 구현 — `ImageGenerationServiceImpl.swift`](https://github.com/drawthingsai/draw-things-community/blob/64646d1202441d6abe17498caa02316669c3fc31/Libraries/GRPC/Server/Sources/ImageGenerationServiceImpl.swift)
- [gRPC image service protobuf 소스](https://github.com/drawthingsai/draw-things-community/tree/64646d1202441d6abe17498caa02316669c3fc31/Libraries/GRPC/Models/Sources/imageService)
- [Draw Things 공식 문서](https://docs.drawthings.ai/)
