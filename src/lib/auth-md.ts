const SCOPES = [
  'swag:products:read',
  'swag:products:write',
  'swag:inventory:read',
  'swag:inventory:write',
  'swag:inventory:audit',
  'swag:discounts:write',
  'swag:orders:write',
] as const;

export function authMdOrigin(requestOrigin?: string): string {
  return (
    process.env.AUTH_MD_SERVICE_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, 'https://') ??
    requestOrigin ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export function authMdEndpoints(requestOrigin?: string) {
  const origin = authMdOrigin(requestOrigin);
  return {
    authMd: `${origin}/auth.md`,
    protectedResourceMetadata: `${origin}/.well-known/oauth-protected-resource`,
    authorizationServerMetadata: `${origin}/.well-known/oauth-authorization-server`,
    mcp: `${origin}/api/mcp`,
    admin: `${origin}/admin`,
  };
}

export function renderAuthMd(requestOrigin?: string): string {
  const endpoints = authMdEndpoints(requestOrigin);

  return [
    '# Inngest Swag Store auth.md',
    '',
    'This service supports WorkOS auth.md-style discovery for agents that operate the Inngest swag store MCP server and automation APIs.',
    '',
    '## 1. Discover',
    '',
    `- Protected Resource Metadata: ${endpoints.protectedResourceMetadata}`,
    `- Authorization Server Metadata: ${endpoints.authorizationServerMetadata}`,
    `- MCP endpoint: ${endpoints.mcp}`,
    '',
    'Unauthorized API responses include a `WWW-Authenticate` header with the protected resource metadata URL.',
    '',
    '## 2. Authenticate',
    '',
    'Use a bearer credential issued from the swag store admin dashboard under API Tokens, or the deployment-level `SWAG_STORE_API_TOKEN` when configured.',
    '',
    '```http',
    'Authorization: Bearer <swag-store-api-token>',
    '```',
    '',
    'This deployment intentionally does not expose public self-service token minting. Human approval happens in the admin dashboard before a token is created.',
    '',
    '## 3. Scopes',
    '',
    ...SCOPES.map((scope) => `- \`${scope}\``),
    '',
    'Current admin-issued bearer tokens are trusted for the full MCP tool surface. The scopes above describe the tool surface for agents and future narrower credentials.',
    '',
    '## 4. Agent Workflow',
    '',
    '- Call `get_api_spec` for schemas, workflow recipes, idempotency notes, and typed errors.',
    '- Use `list_inventory` as the source-of-record inventory view.',
    '- Use `preview_*` tools before write tools, then apply only after user approval.',
    '- Event swag orders should go through `preview_event_order` then `create_event_order`.',
    '',
    '## 5. Security Notes',
    '',
    '- Treat bearer tokens as secrets.',
    '- Prefer revocable admin-generated tokens over long-lived environment tokens.',
    '- Revoke dashboard tokens from `/admin` when an agent no longer needs access.',
  ].join('\n');
}

export function protectedResourceMetadata(requestOrigin?: string) {
  const origin = authMdOrigin(requestOrigin);
  const endpoints = authMdEndpoints(origin);

  return {
    resource: origin,
    resource_name: 'Inngest Swag Store',
    authorization_servers: [origin],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
    resource_documentation: endpoints.authMd,
  };
}

export function authorizationServerMetadata(requestOrigin?: string) {
  const origin = authMdOrigin(requestOrigin);
  const endpoints = authMdEndpoints(origin);

  return {
    issuer: origin,
    service_documentation: endpoints.authMd,
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
    agent_auth: {
      skill: 'https://workos.com/auth.md',
      credential_types_supported: ['api_key'],
      identity_types_supported: ['admin_issued'],
      admin_issued: {
        credential_types_supported: ['api_key'],
        issuance_uri: endpoints.admin,
        instructions: 'Create or revoke agent credentials from the swag store admin dashboard under API Tokens.',
      },
      protected_resources: [endpoints.mcp],
    },
  };
}

export function wwwAuthenticateHeader(requestOrigin?: string): string {
  return `Bearer resource_metadata="${authMdEndpoints(requestOrigin).protectedResourceMetadata}"`;
}

