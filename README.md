# opctl

`opctl` is a small local Node.js + TypeScript CLI bridge for OpenProject API v3. It uses the current user's personal API token and is read-only by default.

## Install

Published package:

- npmjs.com: `opctl`
- current package: `opctl@0.1.4`
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

Export variables in your shell, load a local file with `--env <path>`, or save non-write defaults in a profile. By default, `opctl` also reads `.env` from the current working directory when present; pass `--no-env` to disable that.
Required:

- `OPENPROJECT_URL`: OpenProject instance URL, optionally including an instance path prefix.
- `OPENPROJECT_TOKEN`: personal OpenProject API token.

Optional:

- `OPENPROJECT_AUTH_MODE`: `bearer` (default) or `basic`. Basic auth uses username `apikey` and the token as password.
- `OPENPROJECT_DEFAULT_PROJECT`: project identifier/id used by `wp search` when `--project` is omitted.
- `OPENPROJECT_ALLOW_WRITE`: must be exactly `1` to allow write-capable commands.

Profile commands:

```sh
opctl profile set navlin-qa --url https://openproject.example.com --auth-mode bearer --default-project qa --token ...
opctl profile use navlin-qa
opctl --profile navlin-qa me --json
opctl profile show navlin-qa
opctl profile list
```

Profiles are stored under `${XDG_CONFIG_HOME:-~/.config}/opctl/profiles.json`. The file is written with restrictive permissions where supported, tokens may be stored there, and profile display commands redact tokens. `OPENPROJECT_ALLOW_WRITE` is never loaded from `.env` files or profiles; writes still require the real process environment variable.

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
opctl wp get 123 124 --table
opctl wp get --ids 123,124 --fields id,subject,status,assignee --table
opctl wp get --ids 123,124 --jsonl
```

Field selection supports `id,subject,status,type,assignee,project,href,updatedAt,description,shortDescription,attachmentsCount,lockVersion`; aliases: `title=subject`, `url=href`.

Search work packages:

```sh
opctl wp search --project my-project --subject "pump"
opctl wp search --project my-project --assignee-me --status open
opctl wp search --open --subject "pump" --compact
opctl wp search --subject "pump" --fields id,subject,status --json

```

If `--project` is omitted, `opctl wp search` uses `OPENPROJECT_DEFAULT_PROJECT` when set. Without either, it searches the instance-wide work package endpoint.

List work packages assigned to the authenticated user:

```sh
opctl wp mine
opctl wp mine --open --table
opctl wp mine --project my-project --page-size 50 --fields id,subject,status,updatedAt
```

Triage a known list:

```sh
opctl wp check 123 124
opctl wp check --ids 123,124 --fields id,title,status,assignee,shortDescription,attachmentsCount --table
```

Pull the OpenAPI spec (defaults to the public community instance):

```sh
opctl spec pull
opctl spec pull --output openapi/my-spec.json
opctl spec pull --url https://openproject.example.com
```

Write-capable command:

```sh
OPENPROJECT_ALLOW_WRITE=1 opctl wp comment 123 --dry-run "Investigating"
OPENPROJECT_ALLOW_WRITE=1 opctl wp comment 123 "Investigating"
```

`wp comment` fetches the work package first and posts only when a documented HAL comment action link is present. It fails safely instead of guessing a mutation URL.

## OpenAPI

The repository commits `openapi/openproject.json` and generated types in `src/generated/openproject.ts`. The committed spec is an auditable public OpenProject baseline.

`npm run openapi:pull` and `opctl spec pull` default to the official public spec at `https://community.openproject.org`. They do **not** read `OPENPROJECT_URL` or `OPENPROJECT_TOKEN`, so running tests or pulling the spec never sends credentials to a private instance.

```sh
# Refresh from the public community spec (safe, no credentials needed)
npm run openapi:update

# Pull from a specific private instance (explicit opt-in)
OPENPROJECT_SPEC_URL=https://openproject.example.com \
OPENPROJECT_SPEC_TOKEN=... \
  npm run openapi:pull

# Or via the CLI
opctl spec pull --url https://openproject.example.com
```

Private-instance pulls use dedicated `OPENPROJECT_SPEC_URL` / `OPENPROJECT_SPEC_TOKEN` / `OPENPROJECT_SPEC_AUTH_MODE` variables. Normal `OPENPROJECT_URL` and `OPENPROJECT_TOKEN` are never used for spec pulling.

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
- Spec pulling defaults to the public community spec and ignores `OPENPROJECT_URL` / `OPENPROJECT_TOKEN`; private-instance pulls require explicit `--url` or `OPENPROJECT_SPEC_URL`.
- Local `.env` files are loaded for read configuration by default; `--no-env` disables that, and `.env` cannot enable writes.
- OpenProject writes are blocked unless the real process environment contains `OPENPROJECT_ALLOW_WRITE=1` exactly.
- Every write-capable command supports `--dry-run` and avoids mutation in dry-run mode.
- No destructive commands are implemented: no delete, close, archive, move, or bulk edit.
