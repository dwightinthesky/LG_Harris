import {
  authenticateStaffCredentials,
  clearAuthResponseHeaders,
  createAuthResponseHeaders,
  getAuthenticatedUser,
} from '../_auth.js';
import { jsonResponse, parseJsonBody, toErrorResponse } from '../_http.js';

function methodNotAllowed() {
  return jsonResponse(
    { error: 'Method not allowed.' },
    {
      status: 405,
      headers: { Allow: 'GET, POST, DELETE' },
    },
  );
}

async function handleGet(context) {
  const { request, env } = context;

  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return jsonResponse({ authenticated: false, user: null });
    }

    return jsonResponse({ authenticated: true, user });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function handlePost(context) {
  const { request, env } = context;

  try {
    const body = await parseJsonBody(request);
    const user = await authenticateStaffCredentials(env, body.username, body.password);
    const headers = await createAuthResponseHeaders(env, user);

    return jsonResponse(
      {
        authenticated: true,
        user,
      },
      { headers },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function handleDelete() {
  return jsonResponse(
    {
      authenticated: false,
      user: null,
    },
    {
      headers: clearAuthResponseHeaders(),
    },
  );
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();

  if (method === 'GET') {
    return handleGet(context);
  }

  if (method === 'POST') {
    return handlePost(context);
  }

  if (method === 'DELETE') {
    return handleDelete(context);
  }

  return methodNotAllowed();
}
