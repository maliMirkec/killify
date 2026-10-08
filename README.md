# Killify

Don't you hate when you exit the command via ctrl+c and the dev server still runs?
Don't you hate when you need to find and kill each of these processes manually?

Then Killify is what you need!
Killify finds web dev servers that keep a port open and terminates them.
It only targets known web dev tools, so your other apps stay safe.

## Installation

```bash
npm install -g killify
```

Killify works on macOS, Linux, and Windows:

- macOS: uses `lsof` and `ps`.
- Linux: uses `lsof` and `ps`, or `ss` if `lsof` is not installed.
- Windows: uses PowerShell (Windows 8 or newer).

## Usage

Kill all dev servers:

```bash
killify
```

List dev servers without killing them:

```bash
killify --dry-run
```

Kill only dev servers on specific ports:

```bash
killify --port 8080,3000
```

## Options

| Option | Short | Description |
| --- | --- | --- |
| `--dry-run` | `-d` | List matching dev servers without killing them. |
| `--port` | `-p` | Only target these ports, separated by commas. |
| `--include` | `-i` | Extra regex patterns to match, separated by `\|`. Example: `-i 'puma\|myserver'`. |
| `--exclude` | `-e` | Regex patterns to skip, separated by `\|`. Example: `-e 'storybook'`. |

## Supported tools

Killify matches processes that listen on a TCP port and run one of these tools:

- JavaScript: Eleventy, Vite, VitePress, webpack, Next.js, Nuxt, Astro, SvelteKit, Create React App, Vue CLI, Angular CLI, Parcel, Gatsby, Remix, Docusaurus, Storybook, Browsersync, live-server, http-server, serve, Gulp, Grunt, nodemon, Wrangler, Netlify CLI, Vercel CLI
- Static site generators: Hugo, Jekyll, Zola, Bridgetown, Middleman, Hexo, MkDocs, Pelican
- Other: `php -S`, `python -m http.server`, `rails server`

Use `--include` to add your own.

Killify sends `SIGTERM` first. If the process is still running after one second, it sends `SIGKILL`. On Windows, the process is stopped right away.

## Example

Watch on YouTube: <https://youtu.be/8gjzPBxCd_o>.
