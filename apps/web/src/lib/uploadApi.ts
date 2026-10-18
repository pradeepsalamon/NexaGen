import { API_ROUTES } from "@nexa-chess/types";
import { apiFetch } from "./api";

export function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<{ url: string }>(API_ROUTES.upload.image, {
    body: formData,
    method: "POST",
    // Overrides the client's JSON default, which would make axios serialize the FormData.
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
}

export function deleteImage(url: string) {
  return apiFetch<{ success: boolean }>(API_ROUTES.upload.image, {
    body: { url },
    method: "DELETE"
  });
}

export function uploadPgn(pgn: string, filename?: string) {
  return apiFetch<{ url: string }>(API_ROUTES.upload.pgn, {
    body: { pgn, filename },
    method: "POST"
  });
}
