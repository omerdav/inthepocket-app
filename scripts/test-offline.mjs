import { preview } from 'vite'
import net from 'node:net'
import { spawn } from 'node:child_process'

const PORT = 4173

const portInUse = await new Promise((resolve) => {
  const probe = net.createServer()
  probe.once('error', () => resolve(true))
  probe.once('listening', () => probe.close(() => resolve(false)))
  probe.listen(PORT, '127.0.0.1')
})

if (portInUse) {
  console.error(`✗ Port ${PORT} is already in use.`)
  console.error('  Refusing to run: the test would validate that server, not this build.')
  process.exit(1)
}

const server = await preview({ preview: { port: PORT, strictPort: true } })

let exitCode = 0
try {
  const child = spawn('npx', ['playwright', 'test', '--project=offline'], {
    stdio: 'inherit',
    shell: true
  })
  exitCode = await new Promise((resolve) => {
    child.on('close', resolve)
  })
} finally {
  await server.close()
}

process.exit(exitCode)
