/** Cloudflare Worker entry point for AnaCode. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const imageResponse = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return secureResponse(imageResponse, url);
    }

    const response = await handler.fetch(request, env, ctx);
    return secureResponse(response, url);
  },
};

function createCspNonce() {
  return crypto.randomUUID().replaceAll("-", "");
}

function addNonceToInlineElements(html: string, nonce: string) {
  return html
    .replace(/<script(?=[\s>])/gi, `<script nonce="${nonce}"`)
    .replace(/<style(?=[\s>])/gi, `<style nonce="${nonce}"`);
}

async function secureResponse(response: Response, url: URL) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Origin-Agent-Cluster", "?1");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()");
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  const contentType = headers.get("content-type") ?? "";
  if (contentType.startsWith("text/html")) {
    const nonce = createCspNonce();
    const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
    const styleSource = localDevelopment
      ? "style-src 'self' 'unsafe-inline'"
      : `style-src 'self' 'nonce-${nonce}'`;
    const styleElementSource = localDevelopment
      ? "style-src-elem 'self' 'unsafe-inline'"
      : `style-src-elem 'self' 'nonce-${nonce}'`;
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`,
        "script-src-attr 'none'",
        styleSource,
        styleElementSource,
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "frame-src 'none'",
        "manifest-src 'self'",
      ].join("; "),
    );

    const securedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

    if (typeof HTMLRewriter !== "undefined") {
      return new HTMLRewriter()
        .on("script", { element(element) { element.setAttribute("nonce", nonce); } })
        .on("style", { element(element) { element.setAttribute("nonce", nonce); } })
        .transform(securedResponse);
    }

    // The production Worker has HTMLRewriter. This bounded fallback keeps the
    // exact security policy testable in the Node-based build harness.
    return new Response(addNonceToInlineElements(await securedResponse.text(), nonce), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default worker;
