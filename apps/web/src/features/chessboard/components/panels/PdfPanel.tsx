import { useRef, useState } from "react";
import { useBoardStore } from "../../context/BoardProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { uploadPdf } from "@/lib/uploadApi";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { FileText, Loader2, Trash2, ExternalLink, Upload } from "lucide-react";

export function PdfPanel() {
  const { pdfUrl, setPdfUrl } = useBoardStore();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset input so selecting the same file again still fires change
    e.target.value = "";

    setIsUploading(true);
    try {
      const { url } = await uploadPdf(file);
      setPdfUrl(url);
      toast.success("PDF uploaded and shared to the class.");
    } catch (error) {
      toast.error("Failed to upload PDF.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-3 p-1">
      {isCoach && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-700 px-3 py-1.5 h-auto text-xs font-normal"
          >
            {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {pdfUrl ? "Replace PDF" : "Upload PDF"}
          </Button>
          {pdfUrl && (
            <>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 text-xs font-medium flex items-center gap-1"
              >
                <ExternalLink className="size-3.5" /> Open
              </a>
              <Button
                variant="outline"
                onClick={() => setPdfUrl(null)}
                disabled={isUploading}
                className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-700 px-3 py-1.5 h-auto text-xs font-normal"
              >
                <Trash2 className="size-4" />
                Close
              </Button>
            </>
          )}
        </div>
      )}

      {pdfUrl ? (
        <iframe
          src={pdfUrl}
          title="Chessboard PDF Viewer"
          className="flex-1 min-h-0 w-full rounded-md border border-gray-200 dark:border-slate-700 bg-white"
        />
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 text-sm text-gray-500 dark:text-slate-400 p-4 text-center">
          <FileText className="mb-3 opacity-60" size={28} />
          <span className="font-semibold mb-1">PDF Viewer</span>
          <p className="text-xs">
            {isCoach
              ? "Upload a chess book or worksheet to display it alongside the board. Students see the same document."
              : "Your coach can share a PDF here during the lesson."}
          </p>
        </div>
      )}
    </div>
  );
}
