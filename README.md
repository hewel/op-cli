# opctl

`opctl` is a small local Node.js + TypeScript CLI bridge for OpenProject API v3. It uses the current user's personal API token and is read-only by default.

## Install

Published package:

- npm: <https://www.npmjs.com/package/opctl>
- current package: `opctl@0.1.2`
- binary: `opctl`

Install globally:

```sh
npm install -g opctl
opctl --help
```

Or run without a global install:

```sh
npx opctl --help
```

## Configuration

Export variables in your shell; `opctl` intentionally does not read `.env` files.

Required:

- `OPENPROJECT_URL`: OpenProject instance URL, optionally including an instance path prefix.
- `OPENPROJECT_TOKEN`: personal OpenProject API token.

Optional:

- `OPENPROJECT_AUTH_MODE`: `bearer` (default) or `basic`. Basic auth uses username `apikey` and the token as password.
- `OPENPROJECT_DEFAULT_PROJECT`: project identifier/id used by `wp search` when `--project` is omitted.
- `OPENPROJECT_ALLOW_WRITE`: must be exactly `1` to allow write-capable commands.

## Usage

Show the authenticated OpenProject user:

```sh
opctl me
opctl me --json
```

Inspect API root links:

```sh
opctl api-root
opctl api-root --json
```

List projects:

```sh
opctl projects --page-size 20
opctl projects --json
```

Read work packages:

```sh
opctl wp get 123
opctl wp get 123 --json
opctl wp get 123 --raw-json
```

Search work packages:

```sh
opctl wp search --project my-project --subject "pump"
opctl wp search --project my-project --assignee-me --status open
opctl wp search --subject "pump" --json
```

If `--project` is omitted, `opctl wp search` uses `OPENPROJECT_DEFAULT_PROJECT` when set. Without either, it searches the instance-wide work package endpoint.

List work packages assigned to the authenticated user:

```sh
opctl wp mine
opctl wp mine --project my-project --page-size 50
```

Pull the OpenAPI spec from your configured instance:

```sh
opctl spec pull
```

Write-capable command:

```sh
OPENPROJECT_ALLOW_WRITE=1 opctl wp comment 123 "Investigating" --dry-run
OPENPROJECT_ALLOW_WRITE=1 opctl wp comment 123 "Investigating"
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
