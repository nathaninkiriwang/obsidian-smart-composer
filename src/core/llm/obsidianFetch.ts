import { requestUrl } from 'obsidian'

/**
 * A `fetch`-compatible function backed by Obsidian's `requestUrl`.
 *
 * `requestUrl` runs in Obsidian's main process, so it bypasses the renderer's
 * CORS restrictions. This lets us reach hosts that don't return CORS headers for
 * the Obsidian origin (e.g. Ollama's cloud API at https://ollama.com), which a
 * normal browser `fetch` cannot do.
 *
 * Limitation: `requestUrl` buffers the entire response before resolving, so when
 * this is used for streaming requests the chunks arrive all at once at the end
 * rather than incrementally. It also ignores `AbortSignal`, so in-flight
 * requests can't be cancelled.
 */
export const obsidianFetch = async (
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> => {
  const request = input instanceof Request ? input : undefined

  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

  const method = init?.method ?? request?.method ?? 'GET'

  // Merge headers from the Request (if any) and the per-call init, normalizing
  // to a plain record as requestUrl expects.
  const headers: Record<string, string> = {}
  for (const source of [request?.headers, init?.headers]) {
    if (!source) continue
    new Headers(source).forEach((value, key) => {
      headers[key] = value
    })
  }

  // The OpenAI SDK serializes bodies to a string before calling fetch, but
  // normalize defensively for other shapes.
  let body: string | ArrayBuffer | undefined
  if (init?.body != null) {
    body =
      typeof init.body === 'string' || init.body instanceof ArrayBuffer
        ? init.body
        : await new Response(init.body as BodyInit).text()
  }

  const response = await requestUrl({
    url,
    method,
    headers,
    body,
    throw: false, // surface HTTP errors as normal responses for the SDK to handle
  })

  // requestUrl has already decoded the body, so drop content-encoding to stop
  // anything downstream from trying to decompress it again.
  const responseHeaders = { ...response.headers }
  delete responseHeaders['content-encoding']
  delete responseHeaders['Content-Encoding']

  const nullBodyStatus =
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304

  return new Response(nullBodyStatus ? null : response.arrayBuffer, {
    status: response.status,
    headers: responseHeaders,
  })
}

/**
 * Whether a URL points at a remote host (i.e. not the local machine). Used to
 * decide when to route through {@link obsidianFetch} to dodge CORS, while
 * leaving local connections on the native `fetch` so they keep real streaming.
 */
export const isRemoteHost = (url: string): boolean => {
  try {
    const { hostname } = new URL(url)
    return !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)
  } catch {
    return false
  }
}
