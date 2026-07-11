import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { getWebEnv } from "@nexa-gen/config/web";
import { API_ROUTES } from "@nexa-gen/types";
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
        useAuthStore.getState().clearSession();
        if (typeof window !== "undefined") {
          const publicRoutes = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];
          const isPublicRoute = publicRoutes.some(route => window.location.pathname.startsWith(route));
          if (!isPublicRoute) {
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
      throw new Error(message);
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
