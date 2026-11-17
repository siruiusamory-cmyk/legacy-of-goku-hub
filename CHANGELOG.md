# Changelog

## Administrator runtime repair

- Deploy the current administrator Worker instead of the stale bundle whose Access certificate request used `redirect: "error"`, a mode Cloudflare Workers rejects.
- Keep the committed `admin/wrangler.jsonc` disabled by default and add the explicit `admin/wrangler.production.jsonc` for authorized deployments, with the permanent origins, custom domain, D1 binding and disabled preview URLs.
- Log only the failing request stage when an unexpected administrator exception is caught, without exception text, identities or request data.
