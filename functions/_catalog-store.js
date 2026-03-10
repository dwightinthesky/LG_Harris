const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,}$/;
const SESSION_KEY_PREFIX = 'catalogue-sessions/';
const IMAGE_KEY_PREFIX = 'catalogue-images/';
const SESSION_CONTENT_TYPE = 'application/json; charset=utf-8';

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getStorageBucket(env) {
  const bucket = env?.CATALOGUE_BUCKET;
  if (!bucket || typeof bucket.get !== 'function' || typeof bucket.put !== 'function') {
    throw createHttpError(500, 'Storage is not configured. Missing CATALOGUE_BUCKET binding.');
  }

  return bucket;
}

export function assertSessionId(sessionId) {
  if (!SESSION_ID_PATTERN.test(sessionId ?? '')) {
    throw createHttpError(400, 'Invalid catalogue session id.');
  }
}

export function assertProductId(productId) {
  const value = String(productId ?? '').trim();
  if (!value) {
    throw createHttpError(400, 'Missing product id.');
  }
}

function buildSessionKey(sessionId) {
  return `${SESSION_KEY_PREFIX}${sessionId}.json`;
}

function buildImageKey(sessionId, productId, extension) {
  const safeProductId = encodeURIComponent(String(productId));
  const safeExtension = String(extension).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  return `${IMAGE_KEY_PREFIX}${sessionId}/${safeProductId}.${safeExtension}`;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeProduct(product, fallbackId) {
  return {
    id: product?.id ?? fallbackId,
    brand: normalizeText(product?.brand),
    code: normalizeText(product?.code),
    desc: normalizeText(product?.desc),
    deal: normalizeText(product?.deal),
    list: normalizeText(product?.list),
    image: normalizeText(product?.image),
    imageKey: normalizeText(product?.imageKey),
    imageMimeType: normalizeText(product?.imageMimeType),
    imageUpdatedAt: product?.imageUpdatedAt ?? null,
  };
}

function sanitizeSessionData(sessionId, sessionData) {
  const products = Array.isArray(sessionData?.products)
    ? sessionData.products.map((product, index) => normalizeProduct(product, `product-${index + 1}`))
    : [];

  return {
    sessionId,
    createdAt: sessionData?.createdAt ?? null,
    updatedAt: sessionData?.updatedAt ?? null,
    products,
  };
}

function createImageUrl(sessionId, productId, updatedAt) {
  const searchParams = new URLSearchParams({
    session: sessionId,
    product: String(productId),
    v: updatedAt,
  });
  return `/api/catalog-image?${searchParams.toString()}`;
}

export async function readSession(env, sessionId) {
  assertSessionId(sessionId);

  const bucket = getStorageBucket(env);
  const object = await bucket.get(buildSessionKey(sessionId));
  if (!object) {
    return null;
  }

  let parsed;
  try {
    parsed = await object.json();
  } catch {
    throw createHttpError(500, 'Catalogue session data is invalid.');
  }

  return sanitizeSessionData(sessionId, parsed);
}

export async function writeSession(env, sessionId, sessionData) {
  assertSessionId(sessionId);

  const bucket = getStorageBucket(env);
  const updatedAt = new Date().toISOString();
  const payload = {
    sessionId,
    createdAt: sessionData.createdAt ?? updatedAt,
    updatedAt,
    products: Array.isArray(sessionData.products)
      ? sessionData.products.map((product, index) => normalizeProduct(product, `product-${index + 1}`))
      : [],
  };

  await bucket.put(buildSessionKey(sessionId), JSON.stringify(payload), {
    httpMetadata: {
      contentType: SESSION_CONTENT_TYPE,
    },
  });

  return payload;
}

function mergeProducts(existingProducts, incomingProducts) {
  const existingMap = new Map(
    (Array.isArray(existingProducts) ? existingProducts : []).map((product, index) => {
      const normalized = normalizeProduct(product, `existing-${index + 1}`);
      return [normalized.id, normalized];
    }),
  );

  return (Array.isArray(incomingProducts) ? incomingProducts : []).map((product, index) => {
    const normalized = normalizeProduct(product, product?.id ?? `incoming-${index + 1}`);
    const existing = existingMap.get(normalized.id) ?? null;

    if (!existing) {
      return normalized;
    }

    return {
      ...existing,
      ...normalized,
      image: normalized.image || existing.image || '',
      imageKey: normalized.imageKey || existing.imageKey || '',
      imageMimeType: normalized.imageMimeType || existing.imageMimeType || '',
      imageUpdatedAt: normalized.image ? normalized.imageUpdatedAt ?? existing.imageUpdatedAt : existing.imageUpdatedAt,
    };
  });
}

export async function upsertSessionProducts(env, sessionId, incomingProducts) {
  assertSessionId(sessionId);

  const current = await readSession(env, sessionId);
  const mergedProducts = mergeProducts(current?.products ?? [], incomingProducts);

  return writeSession(env, sessionId, {
    createdAt: current?.createdAt ?? new Date().toISOString(),
    products: mergedProducts,
  });
}

export function getImageExtensionForMimeType(mimeType) {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    default:
      return 'jpg';
  }
}

export async function saveProductImage(env, { sessionId, productId, mimeType, bytes }) {
  assertSessionId(sessionId);
  assertProductId(productId);

  const bucket = getStorageBucket(env);
  const extension = getImageExtensionForMimeType(mimeType);
  const imageKey = buildImageKey(sessionId, productId, extension);

  await bucket.put(imageKey, bytes, {
    httpMetadata: {
      contentType: mimeType,
    },
  });

  const current = await readSession(env, sessionId);
  if (!current) {
    throw createHttpError(404, 'Catalogue session not found.');
  }

  const updatedAt = new Date().toISOString();
  let found = false;
  const products = current.products.map((product, index) => {
    const normalized = normalizeProduct(product, `existing-${index + 1}`);
    if (normalized.id !== productId) {
      return normalized;
    }

    found = true;
    return {
      ...normalized,
      image: createImageUrl(sessionId, productId, updatedAt),
      imageKey,
      imageMimeType: mimeType,
      imageUpdatedAt: updatedAt,
    };
  });

  if (!found) {
    throw createHttpError(404, 'Product not found in this catalogue session.');
  }

  const savedSession = await writeSession(env, sessionId, {
    createdAt: current.createdAt ?? updatedAt,
    products,
  });

  const updatedProduct = savedSession.products.find((product) => product.id === productId) ?? null;
  return {
    session: savedSession,
    product: updatedProduct,
  };
}

export async function readProductImage(env, sessionId, productId) {
  assertSessionId(sessionId);
  assertProductId(productId);

  const bucket = getStorageBucket(env);
  const session = await readSession(env, sessionId);
  if (!session) {
    throw createHttpError(404, 'Catalogue session not found.');
  }

  const product = session.products.find((entry) => entry.id === productId);
  if (!product || !product.imageKey) {
    throw createHttpError(404, 'Product image not found.');
  }

  const object = await bucket.get(product.imageKey);
  if (!object) {
    throw createHttpError(404, 'Product image is unavailable.');
  }

  return {
    object,
    mimeType: product.imageMimeType || object.httpMetadata?.contentType || 'image/jpeg',
  };
}
