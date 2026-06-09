import type { RecipeScrapeSource } from "./recipe-scraper.types";

const MAX_RECIPE_PAGE_BYTES = 1_500_000;
const RECIPE_FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export class RecipeScrapeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeScrapeFetchError";
  }
}

export async function fetchRecipePage(url: string): Promise<RecipeScrapeSource> {
  const initialUrl = parseScrapeUrl(url);
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchWithTimeout(currentUrl);

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");

      if (!location) {
        throw new RecipeScrapeFetchError("The recipe page redirected without a location.");
      }

      currentUrl = parseScrapeUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new RecipeScrapeFetchError(
        response.status === 401 || response.status === 403
          ? "This page is not available to an unauthenticated fetch."
          : `The recipe page returned HTTP ${response.status}.`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("text/html")) {
      throw new RecipeScrapeFetchError("The URL did not return an HTML recipe page.");
    }

    const contentLength = Number(response.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > MAX_RECIPE_PAGE_BYTES) {
      throw new RecipeScrapeFetchError("The recipe page is too large to import.");
    }

    return {
      html: await readLimitedText(response),
      finalUrl: currentUrl.toString(),
    };
  }

  throw new RecipeScrapeFetchError("The recipe page redirected too many times.");
}

export function parseScrapeUrl(url: string): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new RecipeScrapeFetchError("Enter a valid recipe URL.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new RecipeScrapeFetchError("Recipe URLs must use HTTP or HTTPS.");
  }

  if (isBlockedHost(parsedUrl.hostname)) {
    throw new RecipeScrapeFetchError("This host cannot be imported.");
  }

  parsedUrl.hash = "";

  return parsedUrl;
}

async function fetchWithTimeout(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RECIPE_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "ProjectSpice recipe importer",
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RecipeScrapeFetchError("The recipe page took too long to respond.");
    }

    throw new RecipeScrapeFetchError("Could not fetch the recipe page.");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readLimitedText(response: Response): Promise<string> {
  const text = await response.text();

  if (new TextEncoder().encode(text).byteLength > MAX_RECIPE_PAGE_BYTES) {
    throw new RecipeScrapeFetchError("The recipe page is too large to import.");
  }

  return text;
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function isBlockedHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase();

  return (
    BLOCKED_HOSTS.has(normalizedHost) ||
    normalizedHost.endsWith(".localhost") ||
    isPrivateIpv4(normalizedHost) ||
    isPrivateIpv6(normalizedHost)
  );
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);

  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalizedHost = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();

  return (
    normalizedHost === "::1" ||
    normalizedHost.startsWith("fc") ||
    normalizedHost.startsWith("fd") ||
    normalizedHost.startsWith("fe80:")
  );
}
