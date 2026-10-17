import { useMutation } from "@tanstack/react-query";
import { getMyDataExport } from "../api/privacyApi";

/** A mutation, not a query: the export is fetched on demand and never cached. */
export function useDownloadMyData() {
  return useMutation({
    mutationFn: async () => {
      const data = await getMyDataExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexa-my-data-${data.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  });
}
