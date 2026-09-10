# API conventions

Keep API-facing changes consistent and predictable. Validate external input at the boundary, return useful error information without leaking secrets, and document behavior that callers need to rely on.

When changing an existing endpoint, preserve backwards compatibility where practical or clearly document the breaking behavior.