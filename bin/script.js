#!/usr/bin/env node

'use strict';

const { execSync, spawnSync } = require('child_process');
const os = require('os');

const isWindows = process.platform === 'win32';

const DEFAULT_INCLUDE = 'node|npm|npx|yarn|pnpm|nodemon|ts-node|concurrently|gulp|grunt|webpack|vite|esbuild|rollup|parcel|gatsby|next|nuxt|astro|eleventy|hexo|ruby|jekyll|rails|puma|unicorn|sidekiq|python|python3|php|java|hugo';
const DEFAULT_EXCLUDE = 'killify|script\\.js|grep|Visual Studio Code|\\.vscode|Cursor\\.app|JetBrains';

const PROCESS_FLAGS = {
  '--node':   'node|npm|npx|yarn|pnpm|nodemon|ts-node|concurrently|gulp|grunt|webpack|vite|esbuild|rollup|parcel|gatsby|next|nuxt|astro|eleventy|hexo',
  '--ruby':   'ruby|jekyll|rails|puma|unicorn|sidekiq|bundle|rake',
  '--python': 'python|python3|gunicorn|uvicorn|celery|django|flask',
  '--php':    'php|php-fpm|artisan|composer',
  '--java':   'java|gradle|mvn',
  '--go':     'hugo',
};

function parseArgs(argv) {
  const result = { include: null, exclude: DEFAULT_EXCLUDE, ports: [], dryRun: false, global: false, help: false };
  const typePatterns = [];
  let explicitInclude = false;

  for (let i = 0; i < argv.length; i++) {
    if (PROCESS_FLAGS[argv[i]]) { typePatterns.push(PROCESS_FLAGS[argv[i]]); continue; }
    switch (argv[i]) {
      case '--include': case '-i':
        if (argv[i + 1]) { result.include = argv[++i]; explicitInclude = true; } break;
      case '--exclude': case '-e':
        if (argv[i + 1]) result.exclude = argv[++i]; break;
      case '--port': case '-p':
        if (argv[i + 1]) argv[++i].split(',').forEach(p => result.ports.push(p.trim())); break;
      case '--global': case '-g': result.global = true; break;
      case '--dry-run': case '-d': result.dryRun = true; break;
      case '--help': case '-h': result.help = true; break;
    }
  }

  if (typePatterns.length > 0) {
    result.include = typePatterns.join('|');
  } else if (!explicitInclude && result.ports.length === 0) {
    // no flags at all → default process-name matching
    result.include = DEFAULT_INCLUDE;
  }
  // --port only (no type flags, no --include) → include stays null → port-only mode

  return result;
}

function sanitize(pattern) {
  return pattern.replace(/[^a-zA-Z0-9|.:_\-\\]/g, '');
}

function detectType(cmd) {
  if (/\bruby\b|jekyll|puma|unicorn|sidekiq|\bbundle\b|\brake\b/i.test(cmd))           return 'ruby';
  if (/\bpython[23]?\b|gunicorn|uvicorn|\bcelery\b|\bflask\b/i.test(cmd))               return 'python';
  if (/\bphp\b|php-fpm|\bartisan\b/i.test(cmd))                                         return 'php';
  if (/\bjava\b|\bgradle\b|\bmvn\b/i.test(cmd) && !/javascript/i.test(cmd))             return 'java';
  if (/\bhugo\b/i.test(cmd))                                                             return 'go';
  if (/\bnode\b|\.js(\s|$)|\bnpm\b|\bnpx\b|\byarn\b|\bpnpm\b|vite|webpack|esbuild|rollup|parcel|gatsby|eleventy|hexo|\bastro\b|\bnuxt\b|\bnext\b|concurrently|ts-node|nodemon|electron|Code\.app|Visual Studio Code/i.test(cmd)) return 'node';
  return '';
}

function friendlyCommand(cmd) {
  const tokens = cmd.split(/\s+/);
  const scriptToken = [...tokens]
    .reverse()
    .find(t => !t.startsWith('-') && (t.includes('/') || t.includes('\\') || /\.[jt]sx?$|\.py$|\.rb$|\.php$|\.java$/.test(t)));
  if (scriptToken) {
    const base = scriptToken.split(/[/\\]/).pop();
    if (base) return base;
  }
  const first = tokens.find(t => !t.startsWith('-')) || cmd;
  return first.split(/[/\\]/).pop() || first;
}

function printHelp() {
  console.log(`
killify — kill hanging development processes

Usage: killify [options]

Process type shortcuts (combinable):
  --node    node, npm, npx, yarn, pnpm, nodemon, ts-node, concurrently,
            vite, webpack, esbuild, rollup, parcel, gatsby, next, nuxt,
            astro, eleventy, hexo, gulp, grunt
  --ruby    ruby, jekyll, rails, puma, unicorn, sidekiq, bundle, rake
  --python  python, python3, gunicorn, uvicorn, celery, django, flask
  --php     php, php-fpm, artisan, composer
  --java    java, gradle, mvn
  --go      hugo

Options:
  -p, --port <port>        Kill process on this port (repeatable or comma-separated)
  -i, --include <pattern>  Custom processes to kill (grep -E pattern)
                           Default (no type flags): "${DEFAULT_INCLUDE}"
  -e, --exclude <pattern>  Processes to spare (grep -E pattern)
                           Default: "${DEFAULT_EXCLUDE}"
  -g, --global             Kill all matching processes, not just current project
  -d, --dry-run            List matching processes without killing them
  -h, --help               Show this help

By default only processes whose working directory is inside the current
project folder are killed. Use --global to kill all matching user processes.
System and root processes are never touched.

Examples:
  killify                        Kill all default types in current project
  killify --port 3000            Kill whatever is running on port 3000
  killify --port 3000,8080       Kill processes on ports 3000 and 8080
  killify --node --ruby          Kill only node and ruby processes
  killify --python --global      Kill all python processes across all projects
  killify --dry-run              Preview what would be killed
`);
}

// ── Unix ─────────────────────────────────────────────────────────────────────

function parseUnixLine(line) {
  const parts = line.trim().split(/\s+/);
  const cmd = parts.slice(10).join(' ');
  return { pid: parts[1], started: parts[8] || '', type: detectType(cmd), name: friendlyCommand(cmd) };
}

function fetchProcessesUnix(include, exclude, currentUser) {
  let raw = '';
  try {
    raw = execSync(
      `ps aux | awk -v u="${currentUser}" '$1==u' | grep -E '${include}' | grep -Ev '${exclude}'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
  } catch {}
  return raw.trim().split('\n').filter(Boolean).map(parseUnixLine);
}

function getProcessInfoByPidUnix(pid) {
  try {
    const line = execSync(`ps aux | awk -v p="${pid}" '$2==p'`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return line ? parseUnixLine(line) : { pid, started: '', type: '', name: `PID ${pid}` };
  } catch {
    return { pid, started: '', type: '', name: `PID ${pid}` };
  }
}

function filterToProjectUnix(pids, projectDir) {
  try {
    const out = execSync(
      `lsof -a -d cwd -p "${pids.join(',')}" -Fn 2>/dev/null`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const matching = [];
    let cur = null;
    for (const line of out.trim().split('\n')) {
      if (line.startsWith('p')) { cur = line.slice(1).trim(); }
      else if (line.startsWith('n') && cur) {
        const cwd = line.slice(1).trim();
        if (cwd === projectDir || cwd.startsWith(projectDir + '/')) matching.push(cur);
        cur = null;
      }
    }
    return matching;
  } catch {}
  // /proc fallback (Linux)
  return pids.filter(pid => {
    try {
      const cwd = execSync(`readlink /proc/${pid}/cwd 2>/dev/null`, {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      return cwd === projectDir || cwd.startsWith(projectDir + '/');
    } catch { return false; }
  });
}

function getPidsByPortUnix(port) {
  try {
    const out = execSync(`lsof -ti :${port} 2>/dev/null`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch { return []; }
}

function killProcessUnix(pid) {
  return spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
}

// ── Windows ───────────────────────────────────────────────────────────────────

function fetchProcessesWindows(include, exclude) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine,WorkingDirectory,CreationDate | ConvertTo-Json -Compress"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const all = JSON.parse(out);
    const data = Array.isArray(all) ? all : [all];
    const incRe = new RegExp(include, 'i');
    const excRe = new RegExp(exclude, 'i');
    return data
      .filter(p => p && p.ProcessId)
      .filter(p => { const c = p.CommandLine || p.Name || ''; return incRe.test(c) && !excRe.test(c); })
      .map(p => {
        const cmd = p.CommandLine || p.Name || '';
        return {
          pid:     String(p.ProcessId),
          started: p.CreationDate ? formatWindowsDate(p.CreationDate) : '',
          type:    detectType(cmd),
          name:    friendlyCommand(cmd),
          cwd:     (p.WorkingDirectory || '').replace(/[/\\]+$/, ''),
        };
      });
  } catch { return []; }
}

function formatWindowsDate(raw) {
  try {
    const d = new Date(raw);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}

function getProcessInfoByPidWindows(pid) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const data = JSON.parse(out);
    const p = Array.isArray(data) ? data[0] : data;
    if (!p) return { pid, started: '', type: '', name: `PID ${pid}` };
    const cmd = p.CommandLine || p.Name || '';
    return { pid, started: '', type: detectType(cmd), name: friendlyCommand(cmd), cwd: '' };
  } catch { return { pid, started: '', type: '', name: `PID ${pid}` }; }
}

function filterToProjectWindows(processes, projectDir) {
  const dir = projectDir.toLowerCase();
  return processes
    .filter(p => { const c = (p.cwd || '').toLowerCase(); return c === dir || c.startsWith(dir + '\\') || c.startsWith(dir + '/'); })
    .map(p => p.pid);
}

function getPidsByPortWindows(port) {
  try {
    const out = execSync(`netstat -ano`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const pids = new Set();
    const re = new RegExp(`:${port}$`);
    for (const line of out.split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p.length < 4 || !re.test(p[1])) continue;
      // TCP: Proto Local Foreign State PID  —  UDP: Proto Local Foreign PID
      const pid = p[0].toUpperCase() === 'UDP' ? p[3] : p[4];
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    return [...pids];
  } catch { return []; }
}

function killProcessWindows(pid) {
  return spawnSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
}

// ── Platform dispatch ─────────────────────────────────────────────────────────

function fetchProcesses(include, exclude, currentUser) {
  return isWindows ? fetchProcessesWindows(include, exclude) : fetchProcessesUnix(include, exclude, currentUser);
}

function getProcessInfoByPid(pid) {
  return isWindows ? getProcessInfoByPidWindows(pid) : getProcessInfoByPidUnix(pid);
}

function filterToProject(processes, projectDir) {
  const pids = processes.map(p => p.pid);
  const kept = new Set(
    isWindows ? filterToProjectWindows(processes, projectDir) : filterToProjectUnix(pids, projectDir)
  );
  return processes.filter(p => kept.has(p.pid));
}

function getPidsByPort(port) {
  return isWindows ? getPidsByPortWindows(port) : getPidsByPortUnix(port);
}

function killProcess(pid) {
  const r = isWindows ? killProcessWindows(pid) : killProcessUnix(pid);
  return r.status === 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const flags = parseArgs(process.argv.slice(2));

if (flags.help) { printHelp(); process.exit(0); }

const currentUser = os.userInfo().username.replace(/[^a-zA-Z0-9_\-]/g, '');
const projectDir  = process.cwd();

// 1. Process-name matching (skipped in port-only mode)
let processes = [];
if (flags.include) {
  processes = fetchProcesses(sanitize(flags.include), sanitize(flags.exclude), currentUser);
  processes = processes.filter(p => p.pid !== String(process.pid));

  if (!flags.global) {
    const scoped = filterToProject(processes, projectDir);
    if (scoped.length === 0 && processes.length > 0) {
      console.log(`No matching processes found in ${projectDir}`);
      console.log(`\n${processes.length} matching process(es) found elsewhere — run with --global to kill them.`);
      if (flags.ports.length === 0) process.exit(0);
    } else {
      processes = scoped;
    }
  }
}

// 2. Port-based matching (always global — ports are system-wide)
const seenPids = new Set(processes.map(p => p.pid));
for (const port of flags.ports) {
  for (const pid of getPidsByPort(port)) {
    if (seenPids.has(pid)) {
      const existing = processes.find(p => p.pid === pid);
      if (existing) existing.port = port;
    } else {
      processes.push({ ...getProcessInfoByPid(pid), port });
      seenPids.add(pid);
    }
  }
}

if (processes.length === 0) {
  const msg = flags.ports.length > 0
    ? `No processes found on port(s): ${flags.ports.join(', ')}`
    : 'No matching processes found.';
  console.log(msg);
  process.exit(0);
}

// 3. Display
const scope     = !flags.include ? '' : flags.global ? ' globally' : ` in ${projectDir}`;
const pidWidth  = Math.max(...processes.map(p => p.pid.length), 'PID'.length);
const typeWidth = Math.max(...processes.map(p => (p.type || '').length), 'Type'.length);
const hasPort   = processes.some(p => p.port);
const portWidth = hasPort ? Math.max(...processes.map(p => (p.port || '').length), 'Port'.length) : 0;

console.log(`\nFound ${processes.length} process(es)${scope}:\n`);

const header = `  ${'PID'.padStart(pidWidth)}  Started   ${'Type'.padEnd(typeWidth)}${hasPort ? `  ${'Port'.padEnd(portWidth)}` : ''}  Process`;
console.log(header);

processes.forEach(({ pid, started, type, name, port }) => {
  const portCol = hasPort ? `  ${(port || '').padEnd(portWidth)}` : '';
  console.log(`  ${pid.padStart(pidWidth)}  ${(started || '').padEnd(8)}  ${(type || '').padEnd(typeWidth)}${portCol}  ${name}`);
});
console.log();

if (flags.dryRun) {
  const preview = processes.map(({ pid, type, name, port }) => {
    const label = [type, name].filter(Boolean).join(': ');
    return port ? `${pid} (port ${port}: ${label})` : `${pid} (${label})`;
  }).join(', ');
  console.log(`[dry-run] Would kill: ${preview}`);
  process.exit(0);
}

// 4. Kill
let killed = 0;
processes.forEach(({ pid, type, name }) => {
  const ok = killProcess(pid);
  const portCol = hasPort ? `  ${('').padEnd(portWidth)}` : '';
  if (ok) {
    console.log(`  Killed ${pid.padStart(pidWidth)}  ${(type || '').padEnd(typeWidth)}${portCol}  ${name}`);
    killed++;
  } else {
    console.log(`  Could not kill ${pid.padStart(pidWidth)}  ${(type || '').padEnd(typeWidth)}${portCol}  ${name}`);
  }
});

console.log(`\nDone. Killed ${killed}/${processes.length} process(es).`);
