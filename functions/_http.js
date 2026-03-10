export function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function methodNotAllowed(allowedMethods) {
  return jsonResponse(
    { error: 'Method not allowed.' },
    {
      status: 405,
      headers: {
        Allow: Array.isArray(allowedMethods) ? allowedMethods.join(', ') : String(allowedMethods),
      },
    },
  );
}

export async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    const error = new Error('Invalid JSON body.');
    error.status = 400;
    throw error;
  }
}

export function toErrorResponse(error, fallbackMessage = 'Unexpected server error.') {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const message = error?.message || fallbackMessage;
  return jsonResponse({ error: message }, { status });
}
