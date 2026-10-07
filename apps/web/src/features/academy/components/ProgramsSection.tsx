import { ArrowRight, Sparkles } from "lucide-react";

const programs = [
  {
    level: "Beginner Level",
    icon: "♟",
    color: "from-emerald-500/20 to-emerald-600/5",
    borderColor: "hover:border-emerald-500/30",
    glowColor: "group-hover:shadow-emerald-500/10",
    bar: "from-emerald-500 via-emerald-400 to-emerald-500",
    features: [
      "Chess basics & rules",
      "Piece movement mastery",
      "Opening fundamentals",
      "Simple tactics & puzzles",
      "Confidence building",
      "Interactive game play"
    ],
    tag: "Perfect Start",
    tagColor: "bg-emerald-500/10 text-emerald-700 border-emerald-600/20",
    bulletColor: "text-emerald-600"
  },
  {
    level: "Intermediate Level",
    icon: "♞",
    color: "from-gold/20 to-gold-dark/5",
    borderColor: "hover:border-gold/30",
    glowColor: "group-hover:shadow-gold/10",
    bar: "from-[#b8912e] via-[#d4a843] to-[#b8912e]",
    features: [
      "Strategy development",
      "Tactical combinations",
      "Positional understanding",
      "Tournament preparation",
      "Advanced openings",
      "Game analysis sessions"
    ],
    tag: "Most Popular",
    tagColor: "bg-[#d4a843]/12 text-[#8a6b1d] border-[#d4a843]/35",
    bulletColor: "text-[#b8912e]",
    featured: true
  },
  {
    level: "Advanced Level",
    icon: "♚",
    color: "from-purple-500/20 to-purple-600/5",
    borderColor: "hover:border-purple-500/30",
    glowColor: "group-hover:shadow-purple-500/10",
    bar: "from-purple-500 via-purple-400 to-purple-500",
    features: [
      "Advanced opening theory",
      "Deep calculation skills",
      "Endgame mastery",
      "Competitive tournament coaching",
      "Grandmaster game studies",
      "Psychological preparation"
    ],
    tag: "Elite Program",
    tagColor: "bg-purple-500/10 text-purple-700 border-purple-600/20",
    bulletColor: "text-purple-600"
  }
];

export function ProgramsSection() {
  return (
    <section id="programs" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 chess-pattern opacity-20" />
      <div className="absolute inset-0 mesh-soft" />
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="section-head mb-16 reveal reveal-up">
          <span className="eyebrow mb-5">
            <span className="eyebrow-dot" />
            Our Programs
          </span>
          <h2 className="section-title font-[family-name:var(--font-playfair)] mb-4">
            Choose Your <span className="gold-text">Path</span>
          </h2>
          <p className="section-sub">
            Carefully curated programs designed to elevate your chess skills at every level
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 items-start">
          {programs.map((program, i) => (
            <div
              key={program.level}
              className={`group relative flex flex-col h-full u-card ${program.borderColor} card-lift reveal reveal-up ${
                program.featured
                  ? "shadow-[0_28px_60px_-32px_rgba(15,31,47,0.42)] ring-1 ring-[#d4a843]/25"
                  : ""
              }`}
              style={{ transitionDelay: `${0.2 + i * 0.15}s` }}
            >
              <div
                className={`h-[3px] w-full bg-gradient-to-r ${program.bar} ${
                  program.featured ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                } transition-opacity duration-500`}
              />

              <div
                className={`absolute inset-0 bg-gradient-to-br ${program.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
              />

              <div
                className={`absolute -inset-[1px] rounded-[1.25rem] shadow-2xl ${program.glowColor} transition-shadow duration-500 opacity-0 group-hover:opacity-100 pointer-events-none`}
              />

              <div className="relative p-6 sm:p-8 flex flex-col flex-grow">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.6875rem] font-semibold tracking-wide border ${program.tagColor}`}
                  >
                    {program.featured && <Sparkles className="w-3 h-3" />}
                    {program.tag}
                  </span>

                  <div className="text-5xl leading-none text-[#1a3a52] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
                    {program.icon}
                  </div>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold font-[family-name:var(--font-playfair)] tracking-[-0.01em] mb-6 text-text-primary">
                  {program.level}
                </h3>

                <ul className="space-y-3 mb-8">
                  {program.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-text-secondary leading-relaxed">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-current ${program.bulletColor}`} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <a
                  href="#demo"
                  className="mt-auto inline-flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-300 hover:scale-[1.03] active:scale-95 btn-gold !rounded-xl"
                >
                  Start Learning
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
