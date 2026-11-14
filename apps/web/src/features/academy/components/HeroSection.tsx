import { ArrowRight } from "lucide-react";

const chessPieces = ["♔", "♕", "♖", "♗", "♘", "♙"];

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

const particles: Particle[] = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: (i * 17) % 100,
  y: (i * 23) % 100,
  size: (i % 4) + 1.5,
  duration: 8 + (i % 5) * 2,
  delay: (i % 3) * 1.5
}));

const heroStats = [
  { value: "5,000+", label: "Students Trained" },
  { value: "15+", label: "Expert Coaches" },
  { value: "8+", label: "Countries" },
  { value: "100+", label: "Tournament Wins" }
];

export function HeroSection() {
  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Static gradient background (large blurs are not animated to keep
          mobile compositing cheap) */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] max-w-[80vw] bg-[#1a3a52]/[0.05] rounded-full blur-[90px]" />
        <div className="hidden md:block absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#2a5a8a]/[0.04] rounded-full blur-[90px]" />
      </div>

      {/* Chess board pattern overlay */}
      <div className="absolute inset-0 chess-pattern opacity-40" />

      {/* Soft vignette so the content sits above the pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_45%,rgba(255,255,255,0.85),transparent_75%)]" />

      {/* Floating particles - decorative only, skipped on phones */}
      <div className="absolute inset-0 pointer-events-none hidden md:block motion-reduce:hidden">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-[#1a3a52]/40 animate-float"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`
            }}
          />
        ))}
      </div>

      {/* Floating chess pieces - decorative only, skipped on phones */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden hidden md:block motion-reduce:hidden">
        {chessPieces.map((piece, i) => (
          <div
            key={i}
            className="absolute text-[#1a3a52]/[0.08] select-none animate-float-slow"
            style={{
              fontSize: `${60 + i * 20}px`,
              left: `${10 + i * 15}%`,
              top: `${15 + (i % 3) * 25}%`,
              animationDuration: `${8 + i * 2}s`,
              animationDelay: `${i * 0.5}s`,
              transform: `rotate(${i % 2 === 0 ? 10 : -10}deg)`
            }}
          >
            {piece}
          </div>
        ))}
      </div>

      {/* Hero content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        <div className="text-center">
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold font-[family-name:var(--font-playfair)] leading-[1.08] tracking-[-0.025em] mb-6 blue-glow reveal reveal-up"
            style={{ transitionDelay: "0.4s" }}
          >
            <span className="text-[#1a3a52]">NEXA Chess With</span>
            <br />
            <span className="text-[#2a6a9a]">Expert Coaching</span>
          </h1>

          <p
            className="text-lg sm:text-xl text-[#4a5f7f] max-w-2xl mx-auto mb-10 leading-relaxed reveal reveal-up"
            style={{ transitionDelay: "0.6s" }}
          >
            Professional online chess training for{" "}
            <span className="text-[#1a3a52] font-semibold">Beginners</span>,{" "}
            <span className="text-[#1a3a52] font-semibold">Intermediate</span>, and{" "}
            <span className="text-[#1a3a52] font-semibold">Advanced</span> players.
          </p>

          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 reveal reveal-up"
            style={{ transitionDelay: "0.8s" }}
          >
            <a
              href="#demo"
              className="btn-gold text-base !py-3.5 !px-8 rounded-full font-semibold tracking-wide inline-flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
            >
              <span className="text-lg leading-none">♞</span> Book Free Demo
            </a>
            <a
              href="#programs"
              className="btn-outline-gold group text-base !py-3.5 !px-8 rounded-full inline-flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
            >
              Explore Programs
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </div>

          <div className="mt-16 reveal reveal-up" style={{ transitionDelay: "1.0s" }}>
            <div className="mx-auto max-w-4xl glass rounded-2xl px-4 sm:px-8 py-6 sm:py-7 shadow-[0_20px_50px_-32px_rgba(15,31,47,0.6)]">
              <div className="flex flex-wrap items-center justify-center gap-y-6">
                {heroStats.map((stat, i) => (
                  <div key={stat.label} className="flex items-center">
                    {i > 0 && <div className="stat-rule hidden sm:block mx-6 lg:mx-10 min-h-[2.75rem]" />}
                    <div className="text-center px-4 sm:px-0 w-[9.5rem] sm:w-auto">
                      <div className="text-2xl sm:text-3xl font-bold gold-text font-[family-name:var(--font-playfair)]">
                        {stat.value}
                      </div>
                      <div className="text-[0.6875rem] sm:text-xs text-[#7a8fa5] mt-1.5 uppercase tracking-[0.14em] font-medium">
                        {stat.label}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 reveal"
        style={{ transitionDelay: "1.5s" }}
      >
        <span className="text-[0.625rem] text-[#7a8fa5] uppercase tracking-[0.25em] font-medium">Scroll</span>
        <div className="w-5 h-8 rounded-full border border-[#1a3a52]/30 flex justify-center pt-1.5 animate-scroll-indicator">
          <div className="w-1 h-2 rounded-full bg-[#1a3a52]" />
        </div>
      </div>
    </section>
  );
}
