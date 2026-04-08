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

Example `.pi/settings.json`:

```json
{
  "@alexgorbatchev/pi-env": {
    "API_KEY": "your-token-here",
    "API_URL": "http://localhost:3000"
  }
}
```

When Pi runs, these variables are logged to the console and assigned to `process.env`.
