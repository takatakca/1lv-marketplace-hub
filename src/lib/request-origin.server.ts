const DEFAULT_PUBLIC_ORIGIN = "https://1lv.ca";

function allowLocalRequestOrigin() {
  return (
    process.env.GITHUB_ACTIONS === "true" ||
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  );
}

function configuredPublicOrigin() {
  const raw = (process.env.PUBLIC_APP_ORIGIN ?? DEFAULT_PUBLIC_ORIGIN).trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("PUBLIC_APP_ORIGIN must be a valid absolute URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "PUBLIC_APP_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment.",
    );
  }

  return parsed.origin;
}

export function resolveTrustedAppOrigin(requestUrl: string) {
  let request: URL;
  try {
    request = new URL(requestUrl);
  } catch {
    throw new Error("Could not resolve the trusted 1LV return origin.");
  }

  const hostname = request.hostname.toLowerCase();
  const loopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";

  if (loopback && allowLocalRequestOrigin()) {
    if (request.protocol !== "http:" && request.protocol !== "https:") {
      throw new Error("Unsupported local request protocol.");
    }
    return request.origin;
  }

  return configuredPublicOrigin();
}
