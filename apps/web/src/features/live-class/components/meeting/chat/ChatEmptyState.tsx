import { MessageSquareText } from "lucide-react";

export function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 pb-10 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-app bg-primary/10 text-primary-ink">
        <MessageSquareText className="size-6" strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-semibold text-app-text">No messages yet</h3>
      <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-app-muted">
        Ask a question or share an idea with the class.
      </p>
    </div>
  );
}
