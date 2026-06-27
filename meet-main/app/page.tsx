"use client";

import { Video } from "lucide-react";

import { JoinForm } from "@/components/join-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_32%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,23,42,0.04),transparent_35%,rgba(15,23,42,0.1))] dark:bg-[linear-gradient(to_bottom,rgba(2,6,23,0.3),transparent_35%,rgba(2,6,23,0.55))]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <Video className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">BlueRoom</p>
              <h1 className="text-lg font-semibold tracking-tight">Meet in seconds</h1>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full border border-border/70 bg-background/80 px-4 py-1 text-sm text-muted-foreground shadow-sm backdrop-blur">
              Next.js 16 + LiveKit MVP
            </span>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Your own Google Meet style room with a fast, clean workflow.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Create a room, share a link, and start talking with live video,
              audio, and screen sharing. Built for a modern classroom-style
              foundation.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur">
                <p className="text-sm text-muted-foreground">Join flow</p>
                <p className="mt-2 text-base font-medium">Room + name validation</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur">
                <p className="text-sm text-muted-foreground">Media</p>
                <p className="mt-2 text-base font-medium">Audio, camera, screen share</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur">
                <p className="text-sm text-muted-foreground">Responsive</p>
                <p className="mt-2 text-base font-medium">Desktop and mobile ready</p>
              </div>
            </div>
          </div>

          <JoinForm />
        </section>
      </div>
    </main>
  );
}
