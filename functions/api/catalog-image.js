import { getAuthenticatedUser } from '../_auth.js';
import { assertProductId, assertSessionId, readProductImage, readSession } from '../_catalog-store.js';
import { toErrorResponse } from '../_http.js';

async function handleGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session') ?? '';
    const productId = url.searchParams.get('product') ?? '';
    assertSessionId(sessionId);
    assertProductId(productId);

    const session = await readSession(env, sessionId);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Catalogue session not found.' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const user = await getAuthenticatedUser(request, env);
    const canRead =
      session.isShared ||
      (Boolean(user) && (!session.ownerId || session.ownerId === user.userId));
    if (!canRead) {
      return new Response(JSON.stringify({ error: 'This catalogue is private.' }), {
        status: 403,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const { object, mimeType } = await readProductImage(env, sessionId, productId);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('cache-control', 'public, max-age=31536000, immutable');

    if (!headers.has('content-type')) {
      headers.set('content-type', mimeType);
    }

    if (object.httpEtag) {
      headers.set('etag', object.httpEtag);
    }

    return new Response(object.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('catalog-image GET failed', {
      path: request.url,
      status: error.status ?? 500,
      message: error.message,
      stack: error.stack,
    });
    return toErrorResponse(error);
  }
}

function methodNotAllowed() {
  return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      Allow: 'GET',
    },
  });
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() === 'GET') {
    return handleGet(context);
  }

  return methodNotAllowed();
}
