#!/usr/bin/env node

const args = require('args')
const { execFile } = require('child_process')
const { promisify } = require('util')

const run = promisify(execFile)

args
  .option('include', 'Extra regex patterns to match, separated by |')
  .option('exclude', 'Regex patterns to skip, separated by |')
  .option('dry-run', 'List matching dev servers without killing them', false)
  .option('port', 'Only target these ports, separated by commas')

const flags = args.parse(process.argv)

const tools = [
  'eleventy', '@11ty', 'vite', 'vitepress', 'webpack', 'webpack-dev-server',
  'next', 'next-server', 'nuxt', 'nuxi', 'astro', 'svelte-kit', 'sveltekit',
  'react-scripts', 'vue-cli-service', 'ng', 'parcel', 'gatsby', 'remix',
  'docusaurus', 'storybook', 'browser-sync', 'live-server', 'http-server',
  'serve', 'gulp', 'grunt', 'nodemon', 'wrangler', 'workerd', 'netlify',
  'vercel', 'hugo', 'jekyll', 'zola', 'bridgetown', 'middleman', 'hexo',
  'mkdocs', 'pelican'
]

const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const patterns = [
  new RegExp(`(^|[\\s/\\\\"'])(${tools.map(escape).join('|')})([\\s/\\\\.:@"'-]|$)`, 'i'),
  /(^|[\s/\\"'])php\S*\s+(.*\s)?-S\s/i,
  /-m\s+http\.server/i,
  /(^|[\s/\\"'])rails["']?\s+(s|server)(\s|$)/i
]

if (flags.include) patterns.push(new RegExp(flags.include, 'i'))

const exclude = flags.exclude ? new RegExp(flags.exclude, 'i') : null

const ports = String(flags.port || '')
  .split(',')
  .map((port) => port.trim())
  .filter(Boolean)

const parseLsof = (stdout) => {
  const listeners = new Map()
  let pid = null

  stdout.split('\n').forEach((line) => {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1))
      if (!listeners.has(pid)) listeners.set(pid, new Set())
    } else if (line.startsWith('n') && pid) {
      listeners.get(pid).add(line.slice(line.lastIndexOf(':') + 1))
    }
  })

  return listeners
}

const parseSs = (stdout) => {
  const listeners = new Map()

  stdout.split('\n').forEach((line) => {
    const address = line.trim().split(/\s+/)[3]
    if (!address) return

    const port = address.slice(address.lastIndexOf(':') + 1)

    for (const [, pid] of line.matchAll(/pid=(\d+)/g)) {
      if (!listeners.has(Number(pid))) listeners.set(Number(pid), new Set())
      listeners.get(Number(pid)).add(port)
    }
  })

  return listeners
}

const tryRun = async (file, fileArgs) => {
  try {
    return (await run(file, fileArgs, { maxBuffer: 16 * 1024 * 1024 })).stdout
  } catch (error) {
    if (error.code === 'ENOENT') return null
    return error.stdout || ''
  }
}

const getUnixListeners = async () => {
  const lsof = await tryRun('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'])
  if (lsof !== null) return parseLsof(lsof)

  const ss = await tryRun('ss', ['-ltnpH'])
  if (ss !== null) return parseSs(ss)

  throw new Error('Neither lsof nor ss is installed.')
}

const getUnixCommands = async (pids) => {
  const { stdout } = await run('ps', ['-o', 'pid=,command=', '-p', pids.join(',')])
  const commands = new Map()

  stdout.split('\n').forEach((line) => {
    const match = line.trim().match(/^(\d+)\s+(.*)$/)
    if (match) commands.set(Number(match[1]), match[2])
  })

  return commands
}

const windowsScript = `
$c = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess)
$ids = @($c | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
$p = @(Get-CimInstance Win32_Process | Where-Object { $ids -contains $_.ProcessId } | Select-Object ProcessId, CommandLine)
ConvertTo-Json -Compress -InputObject @{ c = $c; p = $p }
`

const getWindowsProcesses = async () => {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsScript], { maxBuffer: 16 * 1024 * 1024 })
  const { c = [], p = [] } = JSON.parse(stdout || '{}')
  const listeners = new Map()
  const commands = new Map()

  c.forEach(({ LocalPort, OwningProcess }) => {
    if (!listeners.has(OwningProcess)) listeners.set(OwningProcess, new Set())
    listeners.get(OwningProcess).add(String(LocalPort))
  })

  p.forEach(({ ProcessId, CommandLine }) => commands.set(ProcessId, CommandLine || ''))

  return { listeners, commands }
}

const getProcesses = async () => {
  if (process.platform === 'win32') return getWindowsProcesses()

  const listeners = await getUnixListeners()
  const commands = listeners.size ? await getUnixCommands([...listeners.keys()]) : new Map()

  return { listeners, commands }
}

const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const shorten = (command) => command.length > 60 ? `${command.slice(0, 57)}...` : command

const main = async () => {
  const { listeners, commands } = await getProcesses()
  listeners.delete(process.pid)

  if (ports.length) {
    listeners.forEach((pidPorts, pid) => {
      if (![...pidPorts].some((port) => ports.includes(port))) listeners.delete(pid)
    })
  }

  if (!listeners.size) {
    console.log('No dev servers found.')
    return
  }

  const targets = [...listeners]
    .map(([pid, pidPorts]) => ({
      pid,
      command: commands.get(pid) || '',
      ports: [...pidPorts].map((port) => `:${port}`).join(' ')
    }))
    .filter(({ command }) => patterns.some((pattern) => pattern.test(command)))
    .filter(({ command }) => !exclude || !exclude.test(command))

  if (!targets.length) {
    console.log('No dev servers found.')
    return
  }

  if (flags.dryRun) {
    targets.forEach(({ pid, command, ports }) => {
      console.log(`Found  ${pid}  ${ports}  ${shorten(command)}`)
    })
    return
  }

  targets.forEach((target) => {
    try {
      process.kill(target.pid, 'SIGTERM')
    } catch (error) {
      target.error = error.code
    }
  })

  await wait(1000)

  targets.forEach((target) => {
    if (!target.error && isAlive(target.pid)) {
      try {
        process.kill(target.pid, 'SIGKILL')
      } catch (error) {
        target.error = error.code
      }
    }
  })

  targets.forEach(({ pid, command, ports, error }) => {
    const status = error && error !== 'ESRCH' ? `Failed (${error})` : 'Killed'
    console.log(`${status}  ${pid}  ${ports}  ${shorten(command)}`)
  })
}

main().catch((error) => {
  console.log(`error: ${error.message}`)
  process.exit(1)
})
