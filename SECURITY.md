# Security Policy

AI Media Canvas is a local-first app that can store provider credentials, generated assets, uploaded files, and project data on the user's machine.

## Reporting a Vulnerability

Please do not open public issues for security-sensitive reports.

Until a dedicated security contact is published, send a private report to the project maintainers through the repository owner's preferred private contact channel. Include:

- affected version or commit
- reproduction steps
- expected and actual behavior
- impact assessment
- relevant logs or screenshots with secrets removed

## Sensitive Data

When reporting issues, do not include:

- API keys
- access tokens
- private project data
- local database contents
- generated assets that are not safe to share

## Scope

Security-sensitive areas include:

- provider credential storage and redaction
- local file access
- uploaded and generated asset handling
- local agent execution
- workspace skill import and execution
- API routes that read or mutate project data
