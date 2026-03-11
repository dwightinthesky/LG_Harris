const AUTH_COOKIE_NAME = 'lg_harris_auth';
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{2,64}$/;

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseCookieHeader(cookieHeader) {
  return String(cookieHeader ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex < 0) {
        return acc;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function toBase64UrlFromString(value) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64UrlToString(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = padded.length % 4;
  const base64 = remainder ? padded + '='.repeat(4 - remainder) : padded;
  return atob(base64);
}

function toBase64UrlFromBytes(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return toBase64UrlFromString(binary);
}

function normalizeUsername(rawUsername) {
  const username = String(rawUsername ?? '').trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw createHttpError(
      400,
      'Username must use letters, numbers, dot, underscore or dash only.',
    );
  }

  return username.toLowerCase();
}

function readStaffAccounts(env) {
  const rawJson = String(env?.STAFF_ACCOUNTS_JSON ?? '').trim();
  if (!rawJson) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw createHttpError(
      500,
      'Staff login configuration is invalid. STAFF_ACCOUNTS_JSON must be valid JSON.',
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createHttpError(
      500,
      'Staff login configuration is invalid. STAFF_ACCOUNTS_JSON must be an object.',
    );
  }

  const accounts = new Map();
  for (const [rawUsername, value] of Object.entries(parsed)) {
    const username = normalizeUsername(rawUsername);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw createHttpError(
        500,
        'Staff login configuration is invalid. Each account must include password details.',
      );
    }

    const password = String(value.password ?? '');
    if (!password) {
      throw createHttpError(
        500,
        `Staff login configuration is invalid. Missing password for account "${rawUsername}".`,
      );
    }

    const displayName = String(value.name ?? rawUsername).trim() || rawUsername;
    accounts.set(username, {
      userId: username,
      displayName,
      password,
      sessionId: `catalog-${username}`,
    });
  }

  return accounts;
}

function readSharedStaffPassword(env) {
  const sharedPassword = String(env?.STAFF_LOGIN_PASSWORD ?? '').trim();
  return sharedPassword || null;
}

function getAuthSecret(env) {
  const secret = String(env?.AUTH_SECRET ?? '').trim();
  if (!secret) {
    throw createHttpError(
      500,
      'Authentication is not configured. Missing AUTH_SECRET environment variable.',
    );
  }

  return secret;
}

async function signMessage(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toBase64UrlFromBytes(new Uint8Array(signature));
}

async function buildSignedToken(env, payload) {
  const secret = getAuthSecret(env);
  const payloadJson = JSON.stringify(payload);
  const payloadEncoded = toBase64UrlFromString(payloadJson);
  const signature = await signMessage(secret, payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

async function verifySignedToken(env, token) {
  const secret = getAuthSecret(env);
  const [payloadEncoded = '', signature = ''] = String(token ?? '').split('.');
  if (!payloadEncoded || !signature) {
    return null;
  }

  const expected = await signMessage(secret, payloadEncoded);
  if (expected !== signature) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64UrlToString(payloadEncoded));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const userId = normalizeUsername(payload.userId ?? '');
  const displayName = String(payload.displayName ?? userId).trim() || userId;
  const sessionId = String(payload.sessionId ?? `catalog-${userId}`).trim();

  return {
    userId,
    displayName,
    sessionId,
  };
}

function createAuthCookie(token) {
  return [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

function clearAuthCookie() {
  return [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

export async function authenticateStaffCredentials(env, rawUsername, rawPassword) {
  const username = normalizeUsername(rawUsername);
  const password = String(rawPassword ?? '');
  if (!password) {
    throw createHttpError(400, 'Password is required.');
  }

  const mappedAccounts = readStaffAccounts(env);
  if (mappedAccounts) {
    const account = mappedAccounts.get(username);
    if (!account || account.password !== password) {
      throw createHttpError(401, 'Invalid staff credentials.');
    }
    return {
      userId: account.userId,
      displayName: account.displayName,
      sessionId: account.sessionId,
    };
  }

  const sharedPassword = readSharedStaffPassword(env);
  if (!sharedPassword) {
    throw createHttpError(
      500,
      'Staff login is not configured. Set STAFF_ACCOUNTS_JSON or STAFF_LOGIN_PASSWORD.',
    );
  }

  if (password !== sharedPassword) {
    throw createHttpError(401, 'Invalid staff credentials.');
  }

  return {
    userId: username,
    displayName: username,
    sessionId: `catalog-${username}`,
  };
}

export async function createAuthResponseHeaders(env, user) {
  const token = await buildSignedToken(env, {
    userId: user.userId,
    displayName: user.displayName,
    sessionId: user.sessionId,
    issuedAt: Date.now(),
  });

  return {
    'set-cookie': createAuthCookie(token),
  };
}

export function clearAuthResponseHeaders() {
  return {
    'set-cookie': clearAuthCookie(),
  };
}

export async function getAuthenticatedUser(request, env) {
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    return await verifySignedToken(env, token);
  } catch (error) {
    if (error.status === 500) {
      throw error;
    }
    return null;
  }
}

export async function requireAuthenticatedUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw createHttpError(401, 'Staff authentication is required.');
  }
  return user;
}
