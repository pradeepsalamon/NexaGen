import { MessageSquareText } from "lucide-react";

export function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center pb-12">
      <div className="mb-6 relative">
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 shadow-sm backdrop-blur-xl">
          <MessageSquareText className="size-10 text-primary" strokeWidth={1.5} />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-app-text mb-2 tracking-tight">
        Welcome to Room Chat
      </h3>
      <p className="text-sm text-app-muted leading-relaxed max-w-[240px]">
        Share ideas, ask questions, or help your classmates. Start the conversation!
      </p>
    </div>
  );
}
