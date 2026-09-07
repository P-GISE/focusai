import type { AiFeedbackPayload, AppSettingsPayload, StoredSessionPayload } from './contracts.js'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function average(values: number[]) {
  if (!values.length) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function getBucketLabel(hour: number) {
  if (hour < 11) {
    return '오전'
  }

  if (hour < 17) {
    return '오후'
  }

  if (hour < 22) {
    return '저녁'
  }

  return '심야'
}

export function buildAiFeedback(
  sessions: StoredSessionPayload[],
  settings: AppSettingsPayload,
): AiFeedbackPayload {
  if (!sessions.length) {
    return {
      strongestSubject: '아직 데이터 없음',
      weakestSubject: '아직 데이터 없음',
      bestBucket: '오전',
      weakestBucket: '오후',
      suggestedGoal: settings.dailyGoalHours,
      summary:
        '첫 학습 세션이 쌓이면 시간대별 집중 패턴과 방해 요인을 기준으로 맞춤 피드백을 제공합니다.',
      strength:
        '현재는 초기 상태입니다. 세션이 3개 이상 쌓이면 강점 시간대와 강한 과목을 자동으로 분석합니다.',
      caution:
        '집중도는 탭 전환, 입력 공백, 카메라 상태 같은 신호를 종합해서 계산합니다.',
      strategy:
        '첫 세션을 완료하면 다음부터는 과목별 비교와 시간대 전략까지 함께 보여줍니다.',
      patterns: [
        { label: '첫 세션 완료 필요', tag: '필수', tone: 'mid' },
        { label: '주간 패턴 분석 대기', tag: '대기', tone: 'low' },
        { label: '과목별 비교 대기', tag: '대기', tone: 'low' },
      ],
    }
  }

  const subjectEntries = Object.entries(
    sessions.reduce<Record<string, number[]>>((accumulator, session) => {
      accumulator[session.subject] ??= []
      accumulator[session.subject].push(session.avgScore)
      return accumulator
    }, {}),
  )
    .map(([subject, values]) => ({ subject, score: Math.round(average(values)) }))
    .sort((a, b) => b.score - a.score)

  const bucketEntries = Object.entries(
    sessions.reduce<Record<string, number[]>>((accumulator, session) => {
      const bucket = getBucketLabel(new Date(session.createdAt).getHours())
      accumulator[bucket] ??= []
      accumulator[bucket].push(session.avgScore)
      return accumulator
    }, {}),
  )
    .map(([bucket, values]) => ({ bucket, score: Math.round(average(values)) }))
    .sort((a, b) => b.score - a.score)

  const averageFocusedHours = average(sessions.map((session) => session.focusedSeconds / 3600))
  const strongestSubject = subjectEntries[0]?.subject ?? '알고리즘'
  const weakestSubject = subjectEntries.at(-1)?.subject ?? '영어'
  const bestBucket = bucketEntries[0]?.bucket ?? '오전'
  const weakestBucket = bucketEntries.at(-1)?.bucket ?? '오후'
  const suggestedGoal = clamp(Math.round(averageFocusedHours + 0.7), 2, 8)

  return {
    strongestSubject,
    weakestSubject,
    bestBucket,
    weakestBucket,
    suggestedGoal,
    summary: `${bestBucket} 시간대의 집중도가 가장 높고, ${weakestBucket} 시간대에 가장 흔들리는 흐름이 보입니다. ${strongestSubject} 과목에서 가장 안정적인 성과가 나왔습니다.`,
    strength: `${bestBucket} 세션 평균 집중도가 가장 높습니다. 중요한 과목을 ${bestBucket}에 배치하는 편이 좋습니다.`,
    caution: `${weakestSubject} 과목은 평균 점수가 가장 낮았습니다. 특히 ${weakestBucket} 시간대에는 탭 전환이나 공백 시간이 늘어나는 경향이 있습니다.`,
    strategy: `최근 실제 집중 시간 평균은 ${averageFocusedHours.toFixed(1)}시간입니다. 일일 목표를 ${suggestedGoal}시간으로 맞추고, ${weakestBucket}에는 45분 이하의 짧은 세션을 권장합니다.`,
    patterns: [
      { label: `${bestBucket} 고집중 구간`, tag: '유지', tone: 'low' },
      { label: `${weakestBucket} 집중 저하`, tag: '관찰', tone: 'high' },
      { label: `${weakestSubject} 보완 필요`, tag: '개선', tone: 'mid' },
    ],
  }
}
