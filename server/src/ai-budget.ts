import { env, runtimeFlags } from './env.js'
import { withConnection } from './mariadb.js'

type AnthropicUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

type BudgetTotalsRow = {
  request_count?: number
  total_cost_usd?: number | string
}

function currentBudgetDay(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function estimatePromptTokens(prompt: string) {
  return Math.max(1, Math.ceil(prompt.length / 4))
}

function isBudgetGuardEnabled() {
  return env.ANTHROPIC_DAILY_REQUEST_LIMIT > 0 || env.ANTHROPIC_DAILY_BUDGET_USD > 0
}

function calculateAnthropicCost(usage: AnthropicUsage) {
  return roundUsd(
    (usage.inputTokens / 1_000_000) * env.ANTHROPIC_INPUT_USD_PER_MILLION +
      (usage.outputTokens / 1_000_000) * env.ANTHROPIC_OUTPUT_USD_PER_MILLION +
      (usage.cacheCreationInputTokens / 1_000_000) * env.ANTHROPIC_CACHE_WRITE_USD_PER_MILLION +
      (usage.cacheReadInputTokens / 1_000_000) * env.ANTHROPIC_CACHE_READ_USD_PER_MILLION,
  )
}

async function getAnthropicBudgetTotals(requestDay = currentBudgetDay()) {
  if (!runtimeFlags.mariaEnabled) {
    return {
      requestCount: 0,
      totalCostUsd: 0,
    }
  }

  return withConnection(async (connection) => {
    const rows = await connection.query<BudgetTotalsRow[]>(
      `
        SELECT
          COUNT(*) AS request_count,
          COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd
        FROM ai_usage_logs
        WHERE provider = 'anthropic'
          AND request_day = ?
          AND was_blocked = 0
      `,
      [requestDay],
    )

    return {
      requestCount: Number(rows[0]?.request_count ?? 0),
      totalCostUsd: Number(rows[0]?.total_cost_usd ?? 0),
    }
  })
}

async function insertUsageLog(params: {
  userId: number
  model: string | null
  requestDay?: string
  usage: AnthropicUsage
  estimatedCostUsd: number
  wasBlocked: boolean
  blockedReason?: string | null
}) {
  if (!runtimeFlags.mariaEnabled) {
    return
  }

  const requestDay = params.requestDay ?? currentBudgetDay()

  await withConnection(async (connection) => {
    await connection.query(
      `
        INSERT INTO ai_usage_logs (
          user_id,
          provider,
          model_name,
          request_day,
          input_tokens,
          output_tokens,
          cache_creation_input_tokens,
          cache_read_input_tokens,
          estimated_cost_usd,
          was_blocked,
          blocked_reason
        )
        VALUES (?, 'anthropic', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        params.userId,
        params.model,
        requestDay,
        params.usage.inputTokens,
        params.usage.outputTokens,
        params.usage.cacheCreationInputTokens,
        params.usage.cacheReadInputTokens,
        params.estimatedCostUsd,
        params.wasBlocked ? 1 : 0,
        params.blockedReason ?? null,
      ],
    )
  })
}

export function isAnthropicBudgetExceededError(error: unknown) {
  return error instanceof Error && error.message.startsWith('ANTHROPIC_BUDGET_')
}

export async function ensureAnthropicBudgetAvailable(params: {
  userId: number
  model: string
  prompt: string
}) {
  if (!runtimeFlags.anthropicEnabled || !isBudgetGuardEnabled()) {
    return
  }

  const requestDay = currentBudgetDay()
  const totals = await getAnthropicBudgetTotals(requestDay)
  const estimatedUsage: AnthropicUsage = {
    inputTokens: estimatePromptTokens(params.prompt),
    outputTokens: env.ANTHROPIC_MAX_TOKENS,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  }
  const projectedRequestCount = totals.requestCount + 1
  const projectedCostUsd = roundUsd(totals.totalCostUsd + calculateAnthropicCost(estimatedUsage))

  if (
    env.ANTHROPIC_DAILY_REQUEST_LIMIT > 0 &&
    projectedRequestCount > env.ANTHROPIC_DAILY_REQUEST_LIMIT
  ) {
    await insertUsageLog({
      userId: params.userId,
      model: params.model,
      requestDay,
      usage: estimatedUsage,
      estimatedCostUsd: 0,
      wasBlocked: true,
      blockedReason: 'daily-request-limit',
    })

    throw new Error(
      `ANTHROPIC_BUDGET_REQUEST_LIMIT_EXCEEDED:daily:${env.ANTHROPIC_DAILY_REQUEST_LIMIT}`,
    )
  }

  if (env.ANTHROPIC_DAILY_BUDGET_USD > 0 && projectedCostUsd > env.ANTHROPIC_DAILY_BUDGET_USD) {
    await insertUsageLog({
      userId: params.userId,
      model: params.model,
      requestDay,
      usage: estimatedUsage,
      estimatedCostUsd: 0,
      wasBlocked: true,
      blockedReason: 'daily-usd-budget',
    })

    throw new Error(
      `ANTHROPIC_BUDGET_DAILY_USD_EXCEEDED:${projectedCostUsd}:${env.ANTHROPIC_DAILY_BUDGET_USD}`,
    )
  }
}

export async function recordAnthropicUsage(params: {
  userId: number
  model: string
  usage: AnthropicUsage
}) {
  const estimatedCostUsd = calculateAnthropicCost(params.usage)

  await insertUsageLog({
    userId: params.userId,
    model: params.model,
    usage: params.usage,
    estimatedCostUsd,
    wasBlocked: false,
    blockedReason: null,
  })

  return estimatedCostUsd
}
