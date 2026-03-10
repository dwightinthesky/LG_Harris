import { assertProductId, assertSessionId, saveProductImage } from '../_catalog-store.js';
import { jsonResponse, parseJsonBody, toErrorResponse } from '../_http.js';

const MAX_SERVER_UPLOAD_BYTES = 4_000_000;
const IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

function decodeDataUrl(dataUrl) {
  const match = IMAGE_DATA_URL_PATTERN.exec(String(dataUrl ?? ''));
  if (!match) {
    const error = new Error('Upload payload must be an image data URL.');
    error.status = 400;
    throw error;
  }

  const mimeType = match[1];
  let binary = '';
  try {
    binary = atob(match[2]);
  } catch {
    const error = new Error('Image payload is not valid base64.');
    error.status = 400;
    throw error;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { mimeType, bytes };
}

async function handlePost(context) {
  const { request, env } = context;

  try {
    const body = await parseJsonBody(request);
    const sessionId = body.sessionId;
    const productId = body.productId;
    assertSessionId(sessionId);
    assertProductId(productId);

    const { mimeType, bytes } = decodeDataUrl(body.imageDataUrl);
    if (bytes.byteLength > MAX_SERVER_UPLOAD_BYTES) {
      return jsonResponse({ error: 'Image payload is too large after compression.' }, { status: 413 });
    }

    const result = await saveProductImage(env, {
      sessionId,
      productId,
      mimeType,
      bytes,
    });

    return jsonResponse({
      sessionId,
      updatedAt: result.session.updatedAt,
      product: result.product,
    });
  } catch (error) {
    console.error('catalog-upload POST failed', {
      path: request.url,
      status: error.status ?? 500,
      message: error.message,
      stack: error.stack,
    });
    return toErrorResponse(error, 'Unexpected upload error.');
  }
}

function methodNotAllowed() {
  return jsonResponse(
    { error: 'Method not allowed.' },
    {
      status: 405,
      headers: { Allow: 'POST' },
    },
  );
}

export async function onRequest(context) {
  if (context.request.method.toUpperCase() === 'POST') {
    return handlePost(context);
  }

  return methodNotAllowed();
}
