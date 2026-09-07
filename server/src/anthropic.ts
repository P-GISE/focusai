import { env, runtimeFlags } from './env.js'
import { buildAiFeedback } from './insights.js'
import { aiFeedbackSchema, type AiFeedbackResultPayload, type AppSettingsPayload, type StoredSessionPayload } from './contracts.js'
import {
  ensureAnthropicBudgetAvailable,
  isAnthropicBudgetExceededError,
  recordAnthropicUsage,
} from './ai-budget.js'

type AnthropicMessageResponse = {
  content?: Array<{
    type?: string
    text?: string
  }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

function stripCodeFence(text: string) {
  const trimmed = text.trim()

  if (!trimmed.startsWith('```')) {
    return trimmed
  }

  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function summarizeSessions(sessions: StoredSessionPayload[]) {
  return sessions.slice(0, 18).map((session) => ({
    createdAt: session.createdAt,
    subject: session.subject,
    mode: session.mode,
    avgScore: session.avgScore,
    finalScore: session.finalScore,
    goalMinutes: session.goalMinutes,
    focusedMinutes: Math.round(session.focusedSeconds / 60),
    elapsedMinutes: Math.round(session.elapsedSeconds / 60),
    tabSwitches: session.tabSwitches,
    idleEvents: session.idleEvents,
    absenceEvents: session.absenceEvents,
    hiddenSeconds: session.hiddenSeconds,
    highestScore: session.highestScore,
    lowestScore: session.lowestScore,
    studied: session.notes.studied,
    distraction: session.notes.distraction,
    nextGoal: session.notes.nextGoal,
  }))
}

function buildPrompt(sessions: StoredSessionPayload[], settings: AppSettingsPayload) {
  const baseline = buildAiFeedback(sessions, settings)
  const dataset = {
    settings,
    totals: {
      sessionCount: sessions.length,
      averageScore: Math.round(
        sessions.reduce((sum, session) => sum + session.avgScore, 0) / Math.max(sessions.length, 1),
      ),
      averageFocusedMinutes: Math.round(
        sessions.reduce((sum, session) => sum + session.focusedSeconds, 0) / Math.max(sessions.length, 1) / 60,
      ),
    },
    sessions: summarizeSessions(sessions),
    baseline,
  }

  return [
    '당신은 FocusAI의 학습 집중도 코치입니다.',
    '입력으로 들어온 학습 세션 데이터만 사용해서 한국어 피드백을 작성하세요.',
    '과장하거나 없는 카메라 분석 결과를 지어내지 마세요.',
    '응답은 반드시 JSON 한 개만 반환하세요. 마크다운, 설명, 코드펜스는 금지합니다.',
    '필수 JSON 스키마:',
    JSON.stringify({
      strongestSubject: 'string',
      weakestSubject: 'string',
      bestBucket: 'string',
      weakestBucket: 'string',
      suggestedGoal: 4,
      summary: 'string',
      strength: 'string',
      caution: 'string',
      strategy: 'string',
      patterns: [
        { label: 'string', tag: 'string', tone: 'low' },
        { label: 'string', tag: 'string', tone: 'mid' },
        { label: 'string', tag: 'string', tone: 'high' },
      ],
    }),
    'patterns는 3개로 제한하고 tone은 low, mid, high 중 하나만 사용하세요.',
    'suggestedGoal은 1부터 8 사이 정수만 허용됩니다.',
    '입력 데이터:',
    JSON.stringify(dataset),
  ].join('\n')
}

async function requestAnthropicFeedback(
  userId: number,
  sessions: StoredSessionPayload[],
  settings: AppSettingsPayload,
) {
  const prompt = buildPrompt(sessions, settings)
  await ensureAnthropicBudgetAvailable({
    userId,
    model: env.ANTHROPIC_MODEL,
    prompt,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), env.ANTHROPIC_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': env.ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: env.ANTHROPIC_MAX_TOKENS,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`ANTHROPIC_REQUEST_FAILED:${response.status}:${detail}`)
    }

    const data = (await response.json()) as AnthropicMessageResponse
    await recordAnthropicUsage({
      userId,
      model: env.ANTHROPIC_MODEL,
      usage: {
        inputTokens: Number(data.usage?.input_tokens ?? 0),
        outputTokens: Number(data.usage?.output_tokens ?? 0),
        cacheCreationInputTokens: Number(data.usage?.cache_creation_input_tokens ?? 0),
        cacheReadInputTokens: Number(data.usage?.cache_read_input_tokens ?? 0),
      },
    })

    const text = data.content
      ?.filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text ?? '')
      .join('\n')
      .trim()

    if (!text) {
      throw new Error('ANTHROPIC_EMPTY_RESPONSE')
    }

    const parsed = safeParseJson<unknown>(stripCodeFence(text))

    if (!parsed) {
      throw new Error('ANTHROPIC_INVALID_JSON')
    }

    return aiFeedbackSchema.parse(parsed)
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateAiFeedback(
  userId: number,
  sessions: StoredSessionPayload[],
  settings: AppSettingsPayload,
): Promise<AiFeedbackResultPayload> {
  const fallback = buildAiFeedback(sessions, settings)

  if (!runtimeFlags.anthropicEnabled || !sessions.length) {
    return {
      insights: fallback,
      source: 'local',
      model: null,
    }
  }

  try {
    const insights = await requestAnthropicFeedback(userId, sessions, settings)
    return {
      insights,
      source: 'anthropic',
      model: env.ANTHROPIC_MODEL,
    }
  } catch (error) {
    if (isAnthropicBudgetExceededError(error)) {
      console.warn('[anthropic.budget]', error)
    } else {
      console.error('[anthropic.feedback]', error)
    }
    return {
      insights: fallback,
      source: 'local',
      model: null,
    }
  }
}
