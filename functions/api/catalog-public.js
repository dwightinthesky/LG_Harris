import { listSharedCatalogues } from '../_catalog-store.js';
import { jsonResponse, methodNotAllowed, toErrorResponse } from '../_http.js';

async function handleGet(context) {
  const { env } = context;

  try {
    const catalogues = await listSharedCatalogues(env, { limit: 48 });
    return jsonResponse({ catalogues });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() === 'GET') {
    return handleGet(context);
  }

  return methodNotAllowed(['GET']);
}
