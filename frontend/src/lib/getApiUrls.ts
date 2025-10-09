// Returns an ordered list of API base URLs to try.
// If NEXT_PUBLIC_API_URL is set at build time, prefer that single URL.
// Otherwise fall back to localhost (for local dev) and the Docker service name (for running in-compose).
export function getApiUrls(): string[] {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env && typeof env === "string" && env.trim().length > 0) {
    // remove trailing slash if present
    const cleaned = env.trim().replace(/\/+$/, "");
    return [cleaned];
  }

  return ["http://localhost:8080", "http://backend:8080"];
}
