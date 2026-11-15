import { MessageSquareText } from "lucide-react";
import { EmptyStateIcon } from "@/components/ui/EmptyState";

export function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 pb-10 text-center">
      <EmptyStateIcon className="mb-5" icon={MessageSquareText} />
      <h3 className="text-sm font-semibold text-app-text">No messages yet</h3>
      <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-app-muted">
        Ask a question or share an idea with the class.
      </p>
    </div>
  );
}
