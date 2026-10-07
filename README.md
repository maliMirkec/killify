# Killify

You hit Ctrl+C. The terminal prompt comes back. But those node processes? Still running. You know the ones.

Killify cleans them up for you with a single command. It only touches processes from the project you're currently in, so nothing else on your machine gets caught in the crossfire.

Works on macOS, Linux, and Windows.

## Installation

```bash
npm install -g killify
```

## Usage

```bash
killify
```

Run it from your project folder after stopping your dev server. That's it.

## Kill by port

Got an `address already in use` error? Kill whatever is sitting on that port.

```bash
killify --port 3000
killify --port 3000,8080
killify --port 3000 --port 8080
```

Port killing is always global — ports are system-wide.

## Kill specific runtimes

Use these flags to target only what you need. You can combine them.

| Flag | What it kills |
|------|--------------|
| `--node` | node, npm, npx, yarn, pnpm, nodemon, ts-node, concurrently, vite, webpack, esbuild, rollup, parcel, gatsby, next, nuxt, astro, eleventy, hexo, gulp, grunt |
| `--ruby` | ruby, jekyll, rails, puma, unicorn, sidekiq, bundle, rake |
| `--python` | python, python3, gunicorn, uvicorn, celery, django, flask |
| `--php` | php, php-fpm, artisan, composer |
| `--java` | java, gradle, mvn |
| `--go` | hugo |

## All options

| Flag | Description |
|------|-------------|
| `-p, --port <port>` | Kill process on this port (repeatable or comma-separated) |
| `--node`, `--ruby`, `--python`, `--php`, `--java`, `--go` | Kill only that type of process |
| `-i, --include <pattern>` | Kill processes matching a custom pattern |
| `-e, --exclude <pattern>` | Spare processes matching a pattern |
| `-g, --global` | Kill matching processes across all projects, not just the current folder |
| `-d, --dry-run` | Show what would be killed without actually killing anything |
| `-h, --help` | Show help |

## Examples

```bash
# Kill everything in the current project
killify

# See what would be killed first
killify --dry-run

# Kill whatever is on port 3000
killify --port 3000

# Kill only node processes
killify --node

# Kill node and ruby processes in all projects
killify --node --ruby --global

# Kill a custom set of processes
killify --include "nginx|redis"
```

## Demo

Watch on YouTube: <https://youtu.be/8gjzPBxCd_o>.
