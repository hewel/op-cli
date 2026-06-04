# opctl

`opctl` is a small local Node.js + TypeScript CLI bridge for OpenProject API v3. It uses the current user's personal API token and is read-only by default.

## Setup

```sh
pnpm install
cp .env.example .env
```

Export variables in your shell; `opctl` intentionally does not read `.env` files.

Required:

- `OPENPROJECT_URL`: OpenProject instance URL, optionally including an instance path prefix.
- `OPENPROJECT_TOKEN`: personal OpenProject API token.

Optional:

- `OPENPROJECT_AUTH_MODE`: `bearer` (default) or `basic`. Basic auth uses username `apikey` and the token as password.
- `OPENPROJECT_DEFAULT_PROJECT`: project identifier/id used by `wp search` when `--project` is omitted.
- `OPENPROJECT_ALLOW_WRITE`: must be exactly `1` to allow write-capable commands.

## Commands

```sh
npm run dev -- me
npm run dev -- api-root
npm run dev -- projects --page-size 20
npm run dev -- wp get 123 --json
npm run dev -- wp search --project my-project --subject "pump" --assignee-me
npm run dev -- wp mine --project my-project
```

Write-capable command:

```sh
OPENPROJECT_ALLOW_WRITE=1 npm run dev -- wp comment 123 "Investigating" --dry-run
OPENPROJECT_ALLOW_WRITE=1 npm run dev -- wp comment 123 "Investigating"
```

`wp comment` fetches the work package first and posts only when a documented HAL comment action link is present. It fails safely instead of guessing a mutation URL.

## OpenAPI

The repository commits `openapi/openproject.json` and generated types in `src/generated/openproject.ts`. The committed spec is an auditable public OpenProject baseline; users should refresh it against their own instance when local API shape matters.

```sh
OPENPROJECT_URL=https://openproject.example.com OPENPROJECT_TOKEN=... npm run openapi:update
```

`npm run openapi:pull` downloads only `/api/v3/spec.json`, uses a timeout, and prints only host, output path, title, and version. It never prints the token or authorization header.

## Build and verification

```sh
npm run typecheck
npm run test
npm run build
node dist/cli.js --help
node dist/cli.js wp --help
```

## Safety model

- No token or `Authorization` header is printed by normal errors, JSON output, spec pulling, or tests.
- `.env` files are ignored and not loaded by the CLI.
- OpenProject writes are blocked unless `OPENPROJECT_ALLOW_WRITE=1` exactly.
- Every write-capable command supports `--dry-run` and avoids mutation in dry-run mode.
- No destructive commands are implemented: no delete, close, archive, move, or bulk edit.
