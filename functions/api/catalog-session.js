import { getAuthenticatedUser, requireAuthenticatedUser } from '../_auth.js';
import { assertSessionId, readSession, upsertSessionProducts } from '../_catalog-store.js';
import { jsonResponse, parseJsonBody, toErrorResponse } from '../_http.js';

function methodNotAllowed() {
  return jsonResponse(
    { error: 'Method not allowed.' },
    {
      status: 405,
      headers: { Allow: 'GET, PUT' },
    },
  );
}

async function handleGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session') ?? '';
    assertSessionId(sessionId);

    const session = await readSession(env, sessionId);
    if (!session) {
      return jsonResponse({ error: 'Catalogue session not found.' }, { status: 404 });
    }

    const user = await getAuthenticatedUser(request, env);
    const canRead =
      session.isShared ||
      (Boolean(user) && (!session.ownerId || session.ownerId === user.userId));
    if (!canRead) {
      return jsonResponse({ error: 'This catalogue is private.' }, { status: 403 });
    }

    return jsonResponse(session);
  } catch (error) {
    console.error('catalog-session GET failed', {
      path: request.url,
      status: error.status ?? 500,
      message: error.message,
      stack: error.stack,
    });
    return toErrorResponse(error);
  }
}

async function handlePut(context) {
  const { request, env } = context;

  try {
    const user = await requireAuthenticatedUser(request, env);
    const body = await parseJsonBody(request);
    const sessionId = body.sessionId;
    assertSessionId(sessionId);

    if (!Array.isArray(body.products)) {
      return jsonResponse({ error: 'Products payload must be an array.' }, { status: 400 });
    }

    const current = await readSession(env, sessionId);
    if (current?.ownerId && current.ownerId !== user.userId) {
      return jsonResponse({ error: 'You do not have permission to edit this catalogue.' }, { status: 403 });
    }

    const session = await upsertSessionProducts(env, sessionId, body.products, {
      ownerId: user.userId,
      ownerName: user.displayName,
    });
    return jsonResponse(session);
  } catch (error) {
    console.error('catalog-session PUT failed', {
      path: request.url,
      status: error.status ?? 500,
      message: error.message,
      stack: error.stack,
    });
    return toErrorResponse(error);
  }
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === 'GET') {
    return handleGet(context);
  }

  if (method === 'PUT') {
    return handlePut(context);
  }

  return methodNotAllowed();
}
