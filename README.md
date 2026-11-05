# @alexgorbatchev/pi-env

A Pi extension that injects environment variables defined in Pi's settings into the active agent process, allowing child processes (like `bash` commands and `process` services) to inherit them.

## Installation

To install this extension globally (for all your Pi sessions):

```bash
pi install npm:@alexgorbatchev/pi-env
```

To install it locally (for a single project):

```bash
pi install npm:@alexgorbatchev/pi-env -l
```

## Configuration

Define environment variables under the `"@alexgorbatchev/pi-env"` key in your settings (either globally or per-project). Both keys and values must be strings.

> [!IMPORTANT]
> Do not store secrets such as API keys, access tokens, or passwords in this extension's settings. The extension currently displays configured values in the Pi UI when a session starts, so only use non-sensitive configuration here.

Example `.pi/settings.json`:

```json
{
  "@alexgorbatchev/pi-env": {
    "APP_ENV": "development",
    "API_URL": "http://localhost:3000"
  }
}
```

When Pi runs, these variables are displayed in the session output and assigned to `process.env`. Use `/env` to print the same report again.

## Development

Use Bun 1.4 or newer and `just`. The extension requires Pi 1.x (1.5 or newer) from the `@earendil-works` package scope and Node.js 22.19 or newer.

```sh
just setup
just check
just run
```

`just run` starts Pi with your real settings. `just test` uses the GitHub-pinned [pi-test-isolation](https://github.com/alexgorbatchev/pi-test-isolation) runner and preload to isolate home, caches, sessions, and temporary files. Direct `bun test` is rejected outside that environment. Tests exercise the installed Pi loader, settings precedence, reporting, and context filtering; CI enforces at least 90% line and function coverage, including unexecuted source.
