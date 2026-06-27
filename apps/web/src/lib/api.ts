const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:3001";

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export async function apiFetch<TResponse>(
  path: string,
  options: ApiFetchOptions = {}
) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    let message = "Something went wrong.";

    try {
      const error = (await response.json()) as {
        message?: string | string[];
      };
      message = Array.isArray(error.message)
        ? error.message.join(" ")
        : error.message || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return (await response.json()) as TResponse;
}
