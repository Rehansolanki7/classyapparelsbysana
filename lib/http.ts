export async function readJsonResponse<T extends object>(response: Response): Promise<Partial<T>> {
  const body = await response.text();
  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Partial<T> : {};
  } catch {
    return {};
  }
}
