import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { getWebEnv } from "@nexa-gen/config/web";

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
  const message = error.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(" ");
  }

  return message || error.response?.statusText || "Something went wrong.";
}
