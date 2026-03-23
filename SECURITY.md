# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |

We support the latest published version of `mcp-legal-doc-analyzer` on npm. Update to the latest release before reporting a vulnerability.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing the maintainers directly or using GitHub's private vulnerability reporting feature (Security → Report a vulnerability).

Include as much of the following as possible:

- A description of the vulnerability and its potential impact.
- Steps to reproduce the issue.
- Any proof-of-concept code, if applicable.
- The version of `mcp-legal-doc-analyzer` you are using.

You can expect an initial response within **72 hours** and a resolution or status update within **14 days**.

## Security Considerations

`mcp-legal-doc-analyzer` processes potentially confidential legal documents entirely locally:

- Documents are never transmitted to external services. All analysis runs on-device.
- Restrict access to the MCP server process to trusted agents and users only.
- Do not log raw document content in environments where audit logs may be accessed by unauthorized parties.
- Clause extraction and risk flagging are heuristic; do not rely solely on automated analysis for legal decisions.
