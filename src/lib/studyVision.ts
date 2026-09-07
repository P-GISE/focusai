import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

export type StudyAttentionState =
  | 'unknown'
  | 'focused'
  | 'reading'
  | 'distracted'
  | 'away'
  | 'unsupported'

export type StudyVisionFramingState =
  | 'unknown'
  | 'good'
  | 'adjust'
  | 'not-found'
  | 'multi-face'
  | 'unsupported'

export type StudyVisionResult = {
  faceSupported: boolean
  faceCount: number
  framing: StudyVisionFramingState
  attention: StudyAttentionState
  faceCenterX: number | null
  faceCenterY: number | null
  faceRatio: number | null
  headYawScore: number
  headPitchScore: number
  blinkScore: number
  issue: string
}

const WASM_ROOT = '/mediapipe/tasks-vision/wasm'
const MODEL_PATH = '/models/face_landmarker.task'

let faceLandmarkerPromise: Promise<FaceLandmarker | null> | null = null

type Point = {
  x: number
  y: number
}

function averagePoint(...points: Point[]): Point {
  const total = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readBlendshapeScore(
  categories:
    | Array<{
        categoryName: string
        score: number
      }>
    | undefined,
  categoryName: string,
) {
  return categories?.find((entry) => entry.categoryName === categoryName)?.score ?? 0
}

export async function loadStudyVision() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
        return await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_PATH,
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
          outputFaceBlendshapes: true,
        })
      } catch (error) {
        console.error('[study-vision.init]', error)
        return null
      }
    })()
  }

  return faceLandmarkerPromise
}

export function resetStudyVision() {
  faceLandmarkerPromise = null
}

export function analyzeStudyVision(
  faceLandmarker: FaceLandmarker | null,
  video: HTMLVideoElement,
  timestampMs: number,
): StudyVisionResult {
  if (!faceLandmarker) {
    return {
      faceSupported: false,
      faceCount: 0,
      framing: 'unsupported',
      attention: 'unsupported',
      faceCenterX: null,
      faceCenterY: null,
      faceRatio: null,
      headYawScore: 0,
      headPitchScore: 0,
      blinkScore: 0,
      issue: '',
    }
  }

  const result = faceLandmarker.detectForVideo(video, timestampMs)
  const landmarks = result.faceLandmarks[0]

  if (!landmarks) {
    return {
      faceSupported: true,
      faceCount: 0,
      framing: 'not-found',
      attention: 'away',
      faceCenterX: null,
      faceCenterY: null,
      faceRatio: null,
      headYawScore: 1,
      headPitchScore: 0,
      blinkScore: 0,
      issue: '얼굴이 카메라에 충분히 보이도록 위치를 맞춰 주세요.',
    }
  }

  if (result.faceLandmarks.length > 1) {
    return {
      faceSupported: true,
      faceCount: result.faceLandmarks.length,
      framing: 'multi-face',
      attention: 'distracted',
      faceCenterX: null,
      faceCenterY: null,
      faceRatio: null,
      headYawScore: 0,
      headPitchScore: 0,
      blinkScore: 0,
      issue: '한 사람만 화면에 보이도록 정리해 주세요.',
    }
  }

  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0

  for (const landmark of landmarks) {
    minX = Math.min(minX, landmark.x)
    minY = Math.min(minY, landmark.y)
    maxX = Math.max(maxX, landmark.x)
    maxY = Math.max(maxY, landmark.y)
  }

  const faceWidth = Math.max(0.001, maxX - minX)
  const faceHeight = Math.max(0.001, maxY - minY)
  const faceCenter = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  }
  const faceRatio = faceWidth * faceHeight
  const xOffset = Math.abs(faceCenter.x - 0.5)
  const yOffset = Math.abs(faceCenter.y - 0.5)

  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]
  const nose = landmarks[1]
  const leftEye = averagePoint(landmarks[33], landmarks[133])
  const rightEye = averagePoint(landmarks[362], landmarks[263])
  const eyeCenter = averagePoint(leftEye, rightEye)
  const chin = landmarks[152]

  const leftSpan = Math.abs(nose.x - leftCheek.x)
  const rightSpan = Math.abs(rightCheek.x - nose.x)
  const headYawScore = clamp(Math.abs(rightSpan - leftSpan) / faceWidth, 0, 1.6)
  const headPitchScore = clamp((nose.y - eyeCenter.y) / Math.max(0.001, chin.y - eyeCenter.y), 0, 1.4)

  const blinkCategories = result.faceBlendshapes?.[0]?.categories
  const blinkScore = clamp(
    (readBlendshapeScore(blinkCategories, 'eyeBlinkLeft') +
      readBlendshapeScore(blinkCategories, 'eyeBlinkRight')) /
      2,
    0,
    1,
  )

  const framing =
    xOffset < 0.19 && yOffset < 0.19 && faceRatio >= 0.06 && faceRatio <= 0.52 ? 'good' : 'adjust'

  let attention: StudyAttentionState = 'focused'
  let issue = ''

  if (framing === 'adjust') {
    attention = 'distracted'
    issue = '얼굴을 화면 중앙에 맞춰 주세요.'
  }

  if (headYawScore >= 0.16) {
    attention = 'distracted'
    issue = '시선이 학습 대상에서 벗어난 것으로 보여요. 고개를 다시 돌려 주세요.'
  } else if (headPitchScore >= 0.28 && headPitchScore <= 0.62) {
    attention = 'reading'
  } else if (headPitchScore > 0.62) {
    attention = 'distracted'
    issue = '고개가 너무 아래로 향해 있어요. 책이나 필기 위치를 조금 올려 주세요.'
  } else if (headPitchScore < 0.12) {
    attention = 'distracted'
    issue = '정면은 보고 있지만 학습 자세로 보기 어려워요. 시선을 학습 대상에 맞춰 주세요.'
  }

  if (blinkScore >= 0.72) {
    attention = 'distracted'
    issue = '눈이 오래 감겨 있어 집중이 떨어진 것으로 보여요.'
  }

  if (attention === 'focused' && headPitchScore >= 0.24) {
    attention = 'reading'
  }

  if (issue === '' && attention === 'focused') {
    issue = '정면 학습 자세가 안정적으로 감지되었습니다.'
  }

  if (issue === '' && attention === 'reading') {
    issue = '책이나 노트를 읽는 자세로 감지되었습니다.'
  }

  return {
    faceSupported: true,
    faceCount: 1,
    framing,
    attention,
    faceCenterX: faceCenter.x,
    faceCenterY: faceCenter.y,
    faceRatio,
    headYawScore,
    headPitchScore,
    blinkScore,
    issue,
  }
}
