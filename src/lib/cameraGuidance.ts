export const CAMERA_ACCESS_RECOVERY_STEPS = [
  '주소창의 사이트 설정에서 카메라 권한을 허용한 뒤 다시 연결해 주세요.',
  '다른 화상회의 앱이나 브라우저 탭이 카메라를 사용 중이면 종료해 주세요.',
  '장치 목록을 새로고침하고 사용할 카메라를 다시 선택해 주세요.',
] as const

export const UNSUPPORTED_CAMERA_MESSAGE =
  '이 브라우저는 카메라 접근을 지원하지 않습니다. 최신 Chrome, Edge, Safari에서 HTTPS 또는 localhost로 접속해 주세요.'

export const VISION_MODEL_FALLBACK_MESSAGE =
  '얼굴 분석 모델을 불러오지 못해 브라우저 기본 신호로 측정합니다. 네트워크 상태를 확인한 뒤 카메라 다시 연결을 누르면 모델 로딩을 다시 시도합니다.'

function readErrorName(error: unknown) {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    return error.name
  }

  return ''
}

export function describeCameraAccessError(error: unknown) {
  switch (readErrorName(error)) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return '카메라 권한이 차단되었습니다. 사이트 설정에서 카메라를 허용한 뒤 다시 연결해 주세요.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '사용 가능한 카메라를 찾지 못했습니다. 웹캠 연결 상태를 확인하고 장치 목록을 새로고침해 주세요.'
    case 'NotReadableError':
    case 'TrackStartError':
      return '카메라를 다른 앱이 사용 중이거나 장치가 응답하지 않습니다. 다른 앱을 종료한 뒤 다시 연결해 주세요.'
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return '선택한 카메라 설정을 사용할 수 없습니다. 다른 카메라를 선택하거나 기본 카메라로 다시 연결해 주세요.'
    case 'AbortError':
      return '브라우저가 카메라 연결을 중단했습니다. 장치를 다시 선택하고 카메라 연결을 다시 시도해 주세요.'
    default:
      return '카메라 연결에 실패했습니다. 장치 사용 중 여부, 브라우저 권한, HTTPS 접속 상태를 확인해 주세요.'
  }
}
