import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { getWebEnv } from "@nexa-chess/config/web";
import { API_ROUTES } from "@nexa-chess/types";
import { useAuthStore } from "../stores/authStore";

const API_BASE_URL = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
}).NEXT_PUBLIC_API_URL;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json"
  },
  withCredentials: true
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

// Extend Axios request config to include _retry flag
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      originalRequest.url !== API_ROUTES.auth.refresh &&
      originalRequest.url !== API_ROUTES.auth.login &&
      originalRequest.url !== API_ROUTES.auth.logout
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await apiClient.post(API_ROUTES.auth.refresh);
        processQueue(null);
        return apiClient(originalRequest);
      } catch (err) {
        processQueue(err as Error);
        const wasAuthenticated = !!useAuthStore.getState().user;
        useAuthStore.getState().clearSession();
        
        if (typeof window !== "undefined" && wasAuthenticated) {
          const publicRoutes = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/demo"];
          const isPublicRoute = publicRoutes.some(route => window.location.pathname.startsWith(route));
          if (!isPublicRoute) {
            import("sonner").then(({ toast }) => {
              toast.error("Session Expired", {
                description: "Your session has expired. Please log in again to continue.",
                id: "session-expired",
              });
            });
            window.dispatchEvent(new CustomEvent("auth:logout"));
          }
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

type ApiFetchOptions = Omit<AxiosRequestConfig, "data" | "url"> & {
  body?: unknown;
};

/**
 * Thrown by `apiFetch` on any non-2xx response. Carries `code` when the API
 * sent a structured `{ message, code }` body — an addition for call sites
 * that need to branch on a specific, known condition (e.g. "coach hasn't
 * joined yet") instead of substring-matching `message` (AUDIT H14). Every
 * existing `error.message` read keeps working unchanged.
 */
export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

import { toast } from "sonner";

export async function apiFetch<TResponse>(
  path: string,
  options: ApiFetchOptions = {}
) {
  try {
    const { body, ...requestConfig } = options;
    const response = await apiClient.request<TResponse>({
      ...requestConfig,
      data: body,
      url: path
    });

    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const message = getApiErrorMessage(error);
      
      // Globally show a toast for network errors (e.g. server down)
      if (!error.response) {
        toast.error("Connection Error", { 
          description: "Cannot connect to the server. Please check your connection.",
          id: "global-network-error" 
        });
      }

      const code = error.response?.data?.code;
      throw new ApiError(message, typeof code === "string" ? code : undefined);
    }

    throw error;
  }
}

function getApiErrorMessage(error: AxiosError<{ message?: string | string[] }>) {
  if (error.response?.status === 429) {
    const retryAfter = error.response.headers["retry-after"];
    if (retryAfter) {
      return `Too Many Requests please try (${retryAfter}s remaining)`;
    }
    return "Too Many Requests please try again later";
  }

  const message = error.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(" ");
  }

  return message || error.response?.statusText || "Something went wrong.";
}
