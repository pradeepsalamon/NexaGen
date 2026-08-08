import { apiFetch } from "./api";

export function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<{ url: string }>("/upload/image", {
    body: formData,
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
}

export function deleteImage(url: string) {
  return apiFetch<{ success: boolean }>("/upload/image", {
    body: { url },
    method: "DELETE"
  });
}

export function uploadPgn(pgn: string, filename?: string) {
  return apiFetch<{ url: string }>("/upload/pgn", {
    body: { pgn, filename },
    method: "POST"
  });
}
