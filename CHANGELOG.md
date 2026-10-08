# Changelog

## 1.0.0

### Breaking changes

- Killify now kills only web dev servers that listen on a TCP port. It no longer kills every `node`, `gulp`, or `http:` process.
- The default `--include` and `--exclude` patterns are removed. Both options now add to or filter the built-in list of dev tools.
- Processes get `SIGTERM` first and `SIGKILL` only if they are still running after one second. Before, they got `SIGKILL` right away.

### New

- Detects Eleventy, Hugo, Jekyll, Vite, Next.js, Nuxt, Astro, SvelteKit, Create React App, Vue CLI, Angular CLI, Gatsby, and more. See the README for the full list.
- `--dry-run` (`-d`) lists matching dev servers without killing them.
- `--port` (`-p`) targets only specific ports, for example `-p 8080,3000`.
- Windows support through PowerShell.
- Linux fallback to `ss` when `lsof` is not installed.
- Output shows the PID, ports, and command for each process.

### Fixes

- Killing several processes at once no longer fails.
