# Error handling notes

Handle expected failures explicitly and keep user-facing errors actionable. Avoid exposing credentials, internal stack traces, or private configuration in logs and responses. State-changing operations should fail clearly rather than silently continuing after an error.