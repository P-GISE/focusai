import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Socket } from 'node:net'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)

test('password-reset mail uses the installed SMTP transport with synthetic loopback delivery', async () => {
  const sockets = new Set<Socket>()
  let delivered = ''
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.write('220 synthetic.local ESMTP\r\n')
    let pending = ''
    let inData = false
    socket.on('data', (chunk) => {
      pending += chunk.toString()
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n')
        const line = pending.slice(0, end)
        pending = pending.slice(end + 2)
        if (inData) {
          if (line === '.') { inData = false; socket.write('250 accepted\r\n') }
          else delivered += `${line}\n`
        } else if (/^EHLO|^HELO/.test(line)) socket.write('250 synthetic.local\r\n')
        else if (line === 'DATA') { inData = true; socket.write('354 continue\r\n') }
        else if (line === 'QUIT') socket.end('221 bye\r\n')
        else socket.write('250 accepted\r\n')
      }
    })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const compiled = ts.transpileModule(readFileSync(new URL('./mailer.ts', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
    }).outputText
    const module = { exports: {} }
    new vm.Script(compiled).runInNewContext({
      module, exports: module.exports, URL, URLSearchParams,
      require: (name: string) => name === './env.js' ? {
        env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: address.port, SMTP_FROM: 'synthetic@example.invalid', APP_BASE_URL: 'https://example.invalid', PASSWORD_RESET_TTL_MINUTES: 15 },
        runtimeFlags: { smtpEnabled: true, smtpSecure: false },
      } : require(name),
    })
    const mailer = module.exports as typeof import('./mailer.js')
    const result = await mailer.sendPasswordResetEmail({ toEmail: 'recipient@example.invalid', toName: 'Synthetic', token: 'synthetic-token' })
    assert.equal(result, 'https://example.invalid/#reset_token=synthetic-token')
    assert.match(delivered, /To: recipient@example.invalid/)
    assert.match(delivered, /Subject:/)
    assert.match(delivered, /synthetic-token/)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
