import type { StudyAttentionState } from './studyVision'

export type FocusTrackingVerdict = 'calibrating' | 'stable' | 'transient' | 'distracted' | 'away' | 'unreliable'

export type FocusTrackingInput = {
  timestampMs: number
  cameraReady: boolean
  faceVisible: boolean
  attention: StudyAttentionState
  faceCenterX: number | null
  faceCenterY: number | null
  faceRatio: number | null
  headYawScore: number
  headPitchScore: number
  blinkScore: number
  lightingGood: boolean
  connectionStable: boolean
  documentFocused: boolean
  idleSeconds: number
  idleThresholdSeconds: number
}

type FocusTrackingSample = FocusTrackingInput & {
  poseUnstable: boolean
  rawScore: number
}

type FocusTrackingBaseline = {
  faceCenterX: number
  faceCenterY: number
  faceRatio: number
}

export type FocusTrackingState = {
  startedAtMs: number
  baseline: FocusTrackingBaseline | null
  samples: FocusTrackingSample[]
}

export type FocusTrackingSummary = {
  verdict: FocusTrackingVerdict
  label: string
  score: number
  stability: number
  baselineReady: boolean
  confirmedAway: boolean
  confirmedDistraction: boolean
  faceMissingMs: number
  orientationOffMs: number
  poseUnstableMs: number
  eyeClosedMs: number
  reason: string
}

export type FocusTrackingConfig = {
  baselineDurationMs: number
  sampleWindowMs: number
  scoreWindowMs: number
  faceMissingGraceMs: number
  awayConfirmMs: number
  orientationConfirmMs: number
  poseConfirmMs: number
  eyeClosedConfirmMs: number
}

export const DEFAULT_FOCUS_TRACKING_CONFIG: FocusTrackingConfig = {
  baselineDurationMs: 8_000,
  sampleWindowMs: 12_000,
  scoreWindowMs: 8_000,
  faceMissingGraceMs: 3_000,
  awayConfirmMs: 6_000,
  orientationConfirmMs: 5_000,
  poseConfirmMs: 5_000,
  eyeClosedConfirmMs: 4_000,
}

export const DEFAULT_FOCUS_TRACKING_SUMMARY: FocusTrackingSummary = {
  verdict: 'calibrating',
  label: '기준선 수집',
  score: 84,
  stability: 100,
  baselineReady: false,
  confirmedAway: false,
  confirmedDistraction: false,
  faceMissingMs: 0,
  orientationOffMs: 0,
  poseUnstableMs: 0,
  eyeClosedMs: 0,
  reason: '학습 자세 기준선을 수집하고 있습니다.',
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function isStableBaselineSample(sample: FocusTrackingInput) {
  return (
    sample.cameraReady &&
    sample.faceVisible &&
    sample.faceCenterX !== null &&
    sample.faceCenterY !== null &&
    sample.faceRatio !== null &&
    (sample.attention === 'focused' || sample.attention === 'reading') &&
    sample.lightingGood &&
    sample.connectionStable
  )
}

function buildBaseline(samples: FocusTrackingInput[]): FocusTrackingBaseline | null {
  const stableSamples = samples.filter(isStableBaselineSample)

  if (stableSamples.length < 5) {
    return null
  }

  return {
    faceCenterX: average(stableSamples.map((sample) => sample.faceCenterX ?? 0.5)),
    faceCenterY: average(stableSamples.map((sample) => sample.faceCenterY ?? 0.5)),
    faceRatio: average(stableSamples.map((sample) => sample.faceRatio ?? 0.18)),
  }
}

function isOrientationOff(sample: FocusTrackingInput) {
  return (
    sample.cameraReady &&
    sample.faceVisible &&
    !isActiveWritingPosture(sample) &&
    (sample.attention === 'distracted' ||
      sample.headYawScore >= 0.16 ||
      sample.headPitchScore > 0.68 ||
      sample.headPitchScore < 0.08)
  )
}

function isEyeClosed(sample: FocusTrackingInput) {
  return sample.cameraReady && sample.faceVisible && sample.blinkScore >= 0.72
}

function isFaceMissing(sample: FocusTrackingInput) {
  return sample.cameraReady && (!sample.faceVisible || sample.attention === 'away')
}

function isActiveInput(sample: FocusTrackingInput) {
  return sample.documentFocused && sample.idleSeconds <= Math.min(8, sample.idleThresholdSeconds * 0.4)
}

function isActiveWritingPosture(sample: FocusTrackingInput) {
  return (
    sample.cameraReady &&
    sample.faceVisible &&
    isActiveInput(sample) &&
    sample.headYawScore < 0.14 &&
    sample.headPitchScore >= 0.62 &&
    sample.headPitchScore <= 0.95
  )
}

function hasPoseShift(sample: FocusTrackingInput, baseline: FocusTrackingBaseline | null) {
  if (!baseline || sample.faceCenterX === null || sample.faceCenterY === null || sample.faceRatio === null) {
    return false
  }

  const centerShift = Math.hypot(sample.faceCenterX - baseline.faceCenterX, sample.faceCenterY - baseline.faceCenterY)
  const ratioShift = Math.abs(sample.faceRatio - baseline.faceRatio) / Math.max(0.001, baseline.faceRatio)
  return centerShift > 0.18 || ratioShift > 0.45
}

function continuousDurationMs(
  samples: FocusTrackingSample[],
  timestampMs: number,
  predicate: (sample: FocusTrackingSample) => boolean,
) {
  let startedAt = timestampMs

  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index]

    if (!predicate(sample)) {
      break
    }

    startedAt = sample.timestampMs
  }

  return timestampMs - startedAt
}

function penaltyProgress(durationMs: number, graceMs: number, confirmMs: number) {
  if (durationMs <= graceMs) return 0
  return clamp((durationMs - graceMs) / Math.max(1, confirmMs - graceMs), 0, 1)
}

function idlePenalty(sample: FocusTrackingInput) {
  if (sample.idleSeconds <= sample.idleThresholdSeconds) {
    return 0
  }

  const idleOverSeconds = sample.idleSeconds - sample.idleThresholdSeconds
  const cameraSignalReliable =
    sample.cameraReady &&
    sample.connectionStable &&
    sample.faceVisible &&
    sample.documentFocused &&
    sample.attention !== 'away'

  if (cameraSignalReliable) {
    return Math.min(18, 8 + Math.floor(idleOverSeconds / 10) * 2)
  }

  return Math.min(34, 16 + Math.floor(idleOverSeconds / 6) * 4)
}

function scoreLabel(verdict: FocusTrackingVerdict) {
  return (
    {
      calibrating: '기준선 수집',
      stable: '안정',
      transient: '일시 변화',
      distracted: '이탈 지속',
      away: '자리 비움',
      unreliable: '측정 제한',
    } satisfies Record<FocusTrackingVerdict, string>
  )[verdict]
}

function reasonForSummary(summary: Omit<FocusTrackingSummary, 'reason'>) {
  if (summary.verdict === 'unreliable') return '카메라 신호가 안정적이지 않아 보조 신호 중심으로 계산합니다.'
  if (summary.verdict === 'calibrating') return '학습 자세 기준선을 수집하고 있습니다.'
  if (summary.confirmedAway) return '얼굴 미감지가 지속되어 자리 비움으로 반영했습니다.'
  if (summary.confirmedDistraction) return '고개/자세 이탈이 충분히 지속되어 집중 이탈로 반영했습니다.'
  if (summary.verdict === 'transient') return '일시적인 움직임은 오탐 방지를 위해 아직 벌점으로 확정하지 않습니다.'
  return '얼굴 추적과 자세가 기준 범위 안에서 안정적입니다.'
}

export function createFocusTracker(startedAtMs = Date.now()): FocusTrackingState {
  return {
    startedAtMs,
    baseline: null,
    samples: [],
  }
}

export function updateFocusTracker(
  state: FocusTrackingState,
  input: FocusTrackingInput,
  config: FocusTrackingConfig = DEFAULT_FOCUS_TRACKING_CONFIG,
): { state: FocusTrackingState; summary: FocusTrackingSummary } {
  const previousSamples = state.samples.filter(
    (sample) => input.timestampMs - sample.timestampMs <= config.sampleWindowMs,
  )
  const baseline =
    state.baseline ??
    (input.timestampMs - state.startedAtMs >= config.baselineDurationMs
      ? buildBaseline([...previousSamples, { ...input, poseUnstable: false, rawScore: 84 }])
      : null)
  const poseUnstable = hasPoseShift(input, baseline)
  const samplesForDurations: FocusTrackingSample[] = [
    ...previousSamples,
    {
      ...input,
      poseUnstable,
      rawScore: 84,
    },
  ]
  const faceMissingMs = continuousDurationMs(samplesForDurations, input.timestampMs, isFaceMissing)
  const orientationOffMs = continuousDurationMs(samplesForDurations, input.timestampMs, isOrientationOff)
  const poseUnstableMs = continuousDurationMs(
    samplesForDurations,
    input.timestampMs,
    (sample) => sample.poseUnstable,
  )
  const eyeClosedMs = continuousDurationMs(samplesForDurations, input.timestampMs, isEyeClosed)
  const confirmedAway = faceMissingMs >= config.awayConfirmMs
  const tabUnfocused = !input.documentFocused
  const idlePenaltyValue = idlePenalty(input)
  const confirmedDistraction =
    tabUnfocused ||
    orientationOffMs >= config.orientationConfirmMs ||
    poseUnstableMs >= config.poseConfirmMs ||
    eyeClosedMs >= config.eyeClosedConfirmMs
  const hasTransientSignal =
    faceMissingMs >= config.faceMissingGraceMs ||
    orientationOffMs > 0 ||
    poseUnstableMs > 0 ||
    eyeClosedMs > 0

  let verdict: FocusTrackingVerdict = baseline ? 'stable' : 'calibrating'

  if (!input.cameraReady || !input.connectionStable) {
    verdict = 'unreliable'
  } else if (confirmedAway) {
    verdict = 'away'
  } else if (confirmedDistraction) {
    verdict = 'distracted'
  } else if (hasTransientSignal) {
    verdict = 'transient'
  }

  const facePenalty = penaltyProgress(faceMissingMs, config.faceMissingGraceMs, config.awayConfirmMs) * 55
  const orientationPenalty = penaltyProgress(orientationOffMs, 1_000, config.orientationConfirmMs) * 26
  const posePenalty = penaltyProgress(poseUnstableMs, 1_000, config.poseConfirmMs) * 20
  const eyePenalty = penaltyProgress(eyeClosedMs, 1_000, config.eyeClosedConfirmMs) * 24
  const cameraPenalty = !input.cameraReady ? 28 : input.connectionStable ? 0 : 18
  const lightingPenalty = input.cameraReady && !input.lightingGood ? 6 : 0
  const stability = Math.round(
    clamp(100 - facePenalty - orientationPenalty - posePenalty - eyePenalty - cameraPenalty - lightingPenalty, 0, 100),
  )
  const attentionAdjustment =
    input.attention === 'reading'
      ? 2
      : input.attention === 'focused'
        ? 0
        : isActiveWritingPosture(input)
          ? -4
          : input.attention === 'distracted'
            ? -10
            : 0
  const rawScore =
    96 -
    facePenalty -
    orientationPenalty -
    posePenalty -
    eyePenalty -
    cameraPenalty -
    lightingPenalty -
    idlePenaltyValue +
    attentionAdjustment
  const sample: FocusTrackingSample = {
    ...input,
    poseUnstable,
    rawScore: Math.round(clamp(rawScore, 8, 98)),
  }
  const nextSamples = [...previousSamples, sample]
  const scoreSamples = nextSamples.filter((entry) => input.timestampMs - entry.timestampMs <= config.scoreWindowMs)
  const smoothedScore = Math.round(average(scoreSamples.map((entry) => entry.rawScore)))
  let score = smoothedScore

  if (tabUnfocused) {
    score = Math.min(score, 34)
  }

  if (confirmedAway) {
    score = Math.min(score, 18)
  } else if (faceMissingMs >= config.faceMissingGraceMs) {
    score = Math.min(score, Math.max(24, 58 - Math.floor(faceMissingMs / 1000) * 4))
  }

  if (eyeClosedMs >= config.eyeClosedConfirmMs) {
    score = Math.min(score, 55)
  } else if (confirmedDistraction) {
    score = Math.min(score, 62)
  }

  if (input.idleSeconds > input.idleThresholdSeconds) {
    const idleCap = input.cameraReady && input.connectionStable && input.faceVisible ? 76 : 52
    score = Math.min(score, idleCap)
  }

  score = Math.round(clamp(score, confirmedAway ? 8 : 14, 98))
  const summaryWithoutReason: Omit<FocusTrackingSummary, 'reason'> = {
    verdict,
    label: scoreLabel(verdict),
    score,
    stability,
    baselineReady: Boolean(baseline),
    confirmedAway,
    confirmedDistraction,
    faceMissingMs,
    orientationOffMs,
    poseUnstableMs,
    eyeClosedMs,
  }

  return {
    state: {
      startedAtMs: state.startedAtMs,
      baseline,
      samples: nextSamples,
    },
    summary: {
      ...summaryWithoutReason,
      reason: reasonForSummary(summaryWithoutReason),
    },
  }
}
