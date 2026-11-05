set dotenv-load := false

default:
    @just --list

setup:
    bun install --frozen-lockfile

# Start Pi with the local extension
run *args:
    bun x --no-install pi -e ./src/index.ts {{ args }}

fmt:
    bun run oxfmt
    just --fmt

fmt-check:
    bun run oxfmt --check
    just --fmt --check

lint:
    bun run oxlint --deny-warnings

typecheck:
    bun run tsc --noEmit

unused:
    bun run --bun ts-unused check tsconfig.json

# Run under the shared supervisor; direct bun test is rejected by the preload
test *args:
    bun --no-env-file run pi-test-isolation -- bun --no-env-file test --coverage {{ args }}

check: fmt-check lint typecheck unused test
