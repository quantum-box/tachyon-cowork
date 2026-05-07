import { DEFAULT_API_BASE_URL } from "./auth";

const DEFAULT_COGNITO_DOMAIN = "https://auth-pool.n1.tachy.one";
const DEFAULT_COGNITO_CLIENT_ID = "78a4raqiqns509aadtv7ftjmee";
const DEFAULT_COGNITO_REDIRECT_URI = "http://localhost:1420/callback";
const DEFAULT_COGNITO_SCOPES = "openid email profile";
const DEFAULT_TENANT_ID = "tn_01hjryxysgey07h5jz5wagqj0m";

function readEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export type CognitoConfig = {
  domain: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
};

export function getConfiguredApiBaseUrl(): string {
  return readEnv("VITE_API_BASE_URL") || DEFAULT_API_BASE_URL;
}

export function getConfiguredDefaultTenantId(): string {
  return readEnv("VITE_DEFAULT_TENANT_ID") || DEFAULT_TENANT_ID;
}

export function getConfiguredCognitoConfig(
  redirectUri?: string,
): CognitoConfig {
  return {
    domain: readEnv("VITE_COGNITO_DOMAIN") || DEFAULT_COGNITO_DOMAIN,
    clientId: readEnv("VITE_COGNITO_CLIENT_ID") || DEFAULT_COGNITO_CLIENT_ID,
    redirectUri:
      redirectUri ||
      readEnv("VITE_COGNITO_REDIRECT_URI") ||
      DEFAULT_COGNITO_REDIRECT_URI,
    scopes: readEnv("VITE_COGNITO_SCOPES") || DEFAULT_COGNITO_SCOPES,
  };
}
