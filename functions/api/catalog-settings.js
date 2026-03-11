import { requireAuthenticatedUser } from '../_auth.js';
import { assertSessionId, readSession, updateSessionSettings } from '../_catalog-store.js';
import { jsonResponse, methodNotAllowed, parseJsonBody, toErrorResponse } from '../_http.js';

async function handlePut(context) {
  const { request, env } = context;

  try {
    const user = await requireAuthenticatedUser(request, env);
    const body = await parseJsonBody(request);
    const sessionId = body.sessionId;
    assertSessionId(sessionId);

    const current = await readSession(env, sessionId);
    if (!current) {
      return jsonResponse({ error: 'Catalogue session not found.' }, { status: 404 });
    }

    if (current.ownerId && current.ownerId !== user.userId) {
      return jsonResponse({ error: 'You do not have permission to update this catalogue.' }, { status: 403 });
    }

    const nextSettings = {
      ownerId: current.ownerId || user.userId,
      ownerName: current.ownerName || user.displayName,
      catalogName: body.catalogName,
      isShared: typeof body.isShared === 'boolean' ? body.isShared : current.isShared,
    };

    const updated = await updateSessionSettings(env, sessionId, nextSettings);
    return jsonResponse(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() === 'PUT') {
    return handlePut(context);
  }

  return methodNotAllowed(['PUT']);
}
