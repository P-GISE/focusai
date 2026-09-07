export function formatDiscordBotDateTime(
  value: string | null | undefined,
  formatDateTime: (value: string | null) => string,
) {
  if (!value) {
    return '-'
  }

  return formatDateTime(value)
}
