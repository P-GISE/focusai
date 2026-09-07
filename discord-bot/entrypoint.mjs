console.log(
  '[focusai-discord-bot] Legacy container compatibility service started; Discord bots are managed by the web admin page.',
)

let shuttingDown = false

function shutdown(signal) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  console.log(`[focusai-discord-bot] Received ${signal}; stopping compatibility service.`)
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

setInterval(() => undefined, 60_000)
