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
    const body = await parseJsonBody(request);
    const sessionId = body.sessionId;
    assertSessionId(sessionId);

    if (!Array.isArray(body.products)) {
      return jsonResponse({ error: 'Products payload must be an array.' }, { status: 400 });
    }

    const session = await upsertSessionProducts(env, sessionId, body.products);
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
