# Security checklist

Use this checklist before merging changes that handle user input, external services, or configuration.

- Do not commit API keys, tokens, passwords, or private credentials.
- Validate data at trust boundaries.
- Keep secrets in environment variables or the project's supported secret store.
- Avoid logging authentication data or sensitive user input.
- Review dependency changes for unexpected permissions or network behavior.
- Confirm error messages do not expose internal credentials or private configuration.
