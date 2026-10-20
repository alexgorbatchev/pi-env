default:
    @just --list

# Install the locked development dependencies
setup:
    bun install --frozen-lockfile

# Start Pi with the local extension
run *args:
    bun x --no-install pi -e ./src/index.ts {{ args }}
