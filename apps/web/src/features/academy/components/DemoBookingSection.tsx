"use client";

import { useState } from "react";
import {
  Users,
  BookOpen,
  BarChart3,
  MessageCircle,
  ShieldCheck,
  Clock,
  UserRound,
  CalendarDays,
  Phone,
  GraduationCap,
  ChevronDown,
  ArrowRight,
  CircleCheckBig
} from "lucide-react";
import type { LeadExperienceLevel } from "@nexa-chess/types";
import { useTheme } from "@/providers/ThemeProvider";
import { useCreateLeadMutation } from "../hooks/useLeadPublicApi";

const demoBenefits = [
  {
    title: "Meet our expert coaches",
    description: "Connect 1-on-1 with an experienced FIDE-rated instructor.",
    Icon: Users
  },
  {
    title: "Understand our program",
    description: "Explore our Grandmaster-designed progressive curriculum.",
    Icon: BookOpen
  },
  {
    title: "Get personalized guidance",
    description: "Receive an immediate assessment of tactical strengths and blindspots.",
    Icon: BarChart3
  },
  {
    title: "Ask your questions",
    description: "Discuss schedule flexibility, tournaments, and tailored learning paths.",
    Icon: MessageCircle
  }
];

// The level goes in the dropdown; the description shows under it. Long option
// text got cut off inside the select on phones, so it lives in a hint instead.
const programOptions = [
  { value: "beginner", label: "Beginner Level", hint: "New to chess" },
  {
    value: "intermediate",
    label: "Intermediate Level",
    hint: "Knows the basics & tactics"
  },
  {
    value: "advanced",
    label: "Advanced Level",
    hint: "Competitive tournament player"
  }
];

export function DemoBookingSection() {
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    fullName: "",
    parentName: "",
    phone: "",
    age: "",
    program: "beginner"
  });

  const createLead = useCreateLeadMutation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = formData.phone.replace(/\D/g, "");

    if (cleanPhone.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    const studentName = formData.fullName.trim();
    if (!studentName) {
      setError("Full name is required.");
      return;
    }

    const parentName = formData.parentName.trim() || studentName;
    const studentAge = Number(formData.age);
    if (!Number.isInteger(studentAge) || studentAge < 3 || studentAge > 99) {
      setError("Please enter the student's age (3–99).");
      return;
    }
    const experienceLevel = (formData.program || "beginner") as LeadExperienceLevel;

    setError("");

    createLead.mutate(
      {
        studentName,
        parentName,
        studentAge,
        experienceLevel,
        phone: cleanPhone
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          setTimeout(() => setSubmitted(false), 5000);
          setFormData({
            fullName: "",
            parentName: "",
            phone: "",
            age: "",
            program: "beginner"
          });
        },
        onError: () => {
          setError("Failed to register. Please try again or reach us via WhatsApp.");
        }
      }
    );
  };

  const selectedProgram =
    programOptions.find((o) => o.value === formData.program) ?? programOptions[0];

  const labelClass = `block text-[11px] font-bold uppercase tracking-[0.08em] mb-1.5 ${isDark ? "text-[#C1C4CC]" : "text-[#3B4454]"
    }`;

  const inputSurfaceClass = isDark
    ? "bg-[#091732] border-white/12 text-white placeholder:text-[#7E899B] focus:border-[#E2B355]"
    : "bg-[#F9FAFC] border-[#E2E8F0] text-[#071B41] placeholder:text-[#8E98A8] focus:border-[#C58927]";

  // text-base (16px) on phones: smaller input text makes iPhones zoom the page on focus
  const inputBaseClass = `w-full h-11 rounded-xl text-base sm:text-sm border outline-none transition-colors ${inputSurfaceClass}`;

  return (
    <section
      id="demo"
      className={`relative scroll-mt-14 py-16 sm:py-24 transition-colors duration-300 ${isDark ? "bg-[#030D24] text-white" : "bg-[#FAFBFD] text-[#071B41]"
        }`}
    >
      <div className="relative max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8">
        {/*
          Phones / tablets: heading -> form -> benefits (the form is reachable right away).
          Desktop: heading + benefits stacked on the left, form spanning both rows on the right.
        */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-x-12 lg:gap-y-0 items-center">
          {/* ================= HEADING & COPY ================= */}
          <div className="lg:col-span-6 lg:col-start-1 lg:row-start-1 lg:self-end text-center lg:text-left">
            {/* Eyebrow Pill */}
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] mb-4 ${isDark
                ? "bg-[#0B1A38] border-white/12 text-white"
                : "bg-white border-[#E2E8F0] text-[#071B41] shadow-2xs"
                }`}
            >
              <span className="size-2 rounded-full bg-[#D49B35] dark:bg-[#E2B355]" />
              <span>FREE EVALUATION</span>
            </div>

            {/* Main Heading */}
            <h2
              className={`text-[2rem] sm:text-4xl lg:text-[46px] font-bold font-[family-name:var(--font-playfair)] leading-[1.12] tracking-[-0.02em] mb-4 ${isDark ? "text-white" : "text-[#071B41]"
                }`}
            >
              Book Your
              <br />
              <span className="text-[#D49B35] dark:text-[#E2B355]">
                Free Demo
              </span>{" "}
              Class
            </h2>

            {/* Subtitle */}
            <p
              className={`text-sm sm:text-base leading-relaxed max-w-[480px] mx-auto lg:mx-0 lg:mb-8 ${isDark ? "text-[#C1C4CC]" : "text-[#4A5568]"
                }`}
            >
              Experience our live coaching methodology with zero commitment. Meet
              our coaches, evaluate your chess skills, and get a tailored
              learning roadmap.
            </p>
          </div>

          {/* ================= FORM CARD ================= */}
          <div className="lg:col-span-6 lg:col-start-7 lg:row-start-1 lg:row-span-2 flex justify-center lg:justify-end">
            <div
              className={`relative w-full max-w-[500px] rounded-[22px] border p-5 sm:p-8 transition-all duration-300 ${isDark
                ? "bg-[#071531] border-white/12 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.7)]"
                : "bg-white border-[#E8ECF2] shadow-[0_20px_50px_-15px_rgba(7,27,65,0.10)]"
                }`}
            >
              <h3
                className={`text-xl sm:text-2xl font-bold font-[family-name:var(--font-playfair)] mb-1 ${isDark ? "text-white" : "text-[#071B41]"
                  }`}
              >
                Register for Free Demo
              </h3>
              <p
                className={`text-xs sm:text-[13px] mb-5 sm:mb-6 ${isDark ? "text-[#A9B2C3]" : "text-[#555C68]"
                  }`}
              >
                Fill in your details and our team will schedule your personalized
                class.
              </p>

              <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
                {/* Row 1: Full Name (Student) */}
                <div>
                  <label htmlFor="demo-full-name" className={labelClass}>
                    FULL NAME (STUDENT)
                  </label>
                  <div className="relative">
                    <UserRound
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#64748B]"
                      strokeWidth={2}
                    />
                    <input
                      id="demo-full-name"
                      type="text"
                      required
                      autoComplete="off"
                      enterKeyHint="next"
                      value={formData.fullName}
                      onChange={(e) =>
                        setFormData({ ...formData, fullName: e.target.value })
                      }
                      className={`${inputBaseClass} pl-10 pr-4`}
                      placeholder="e.g. Aarav Sharma"
                    />
                  </div>
                </div>

                {/* Row 2: Parent / Guardian & Age.
                    Side by side from 360px up; stacked on very small phones so labels never wrap. */}
                <div className="grid grid-cols-1 min-[360px]:grid-cols-[minmax(0,1fr)_96px] sm:grid-cols-[minmax(0,1fr)_130px] gap-3">
                  <div className="min-w-0">
                    <label htmlFor="demo-parent-name" className={labelClass}>
                      Parent<span className="hidden sm:inline"> / Guardian</span>
                      <span className="font-medium normal-case tracking-normal opacity-70">
                        {" "}
                        (optional)
                      </span>
                    </label>
                    <div className="relative">
                      <UserRound
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#64748B]"
                        strokeWidth={2}
                      />
                      <input
                        id="demo-parent-name"
                        type="text"
                        autoComplete="name"
                        enterKeyHint="next"
                        value={formData.parentName}
                        onChange={(e) =>
                          setFormData({ ...formData, parentName: e.target.value })
                        }
                        className={`${inputBaseClass} pl-10 pr-3`}
                        placeholder="e.g. Rajesh Sharma"
                      />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label htmlFor="demo-student-age" className={labelClass}>
                      AGE
                    </label>
                    <div className="relative">
                      <input
                        id="demo-student-age"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        enterKeyHint="next"
                        value={formData.age}
                        onChange={(e) => {
                          const digits = e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 2);
                          setFormData({ ...formData, age: digits });
                        }}
                        className={`${inputBaseClass} pl-3.5 pr-9`}
                        placeholder="10"
                      />
                      <CalendarDays
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-[#64748B]"
                        strokeWidth={2}
                      />
                    </div>
                  </div>
                </div>

                {/* Row 3: Phone Number (10 Digits Only) */}
                <div>
                  <label htmlFor="demo-phone" className={labelClass}>
                    PHONE NUMBER (10 DIGITS)
                  </label>
                  <div className="relative">
                    <Phone
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#64748B]"
                      strokeWidth={2}
                    />
                    <input
                      id="demo-phone"
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="tel-national"
                      enterKeyHint="next"
                      required
                      maxLength={10}
                      value={formData.phone}
                      onChange={(e) => {
                        const digits = e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 10);
                        setFormData({ ...formData, phone: digits });
                      }}
                      className={`${inputBaseClass} pl-10 pr-4`}
                      placeholder="9876543210"
                    />
                  </div>
                </div>

                {/* Row 5: Select Program with Gold GraduationCap Icon */}
                <div>
                  <label htmlFor="demo-program" className={labelClass}>
                    SELECT PROGRAM
                  </label>
                  <div className="relative">
                    <GraduationCap
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#C58927] dark:text-[#E2B355]"
                      strokeWidth={2.2}
                    />
                    <select
                      id="demo-program"
                      value={formData.program}
                      onChange={(e) =>
                        setFormData({ ...formData, program: e.target.value })
                      }
                      className={`${inputBaseClass} appearance-none pl-10 pr-9 cursor-pointer`}
                    >
                      {programOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-[#64748B]"
                      strokeWidth={2.2}
                    />
                  </div>
                  <p
                    className={`mt-1.5 text-[11px] sm:text-xs ${isDark ? "text-[#A9B2C3]" : "text-[#555C68]"
                      }`}
                  >
                    {selectedProgram.hint}
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-500"
                  >
                    {error}
                  </div>
                )}

                {/* Gold CTA Button */}
                <button
                  type="submit"
                  disabled={createLead.isPending}
                  className="
                    w-full h-12 mt-1 rounded-xl
                    inline-flex items-center justify-center gap-2
                    bg-gradient-to-r from-[#E6B960] via-[#DDA843] to-[#CE942E]
                    hover:from-[#EDC36E] hover:to-[#D89B32]
                    text-[#071B41] text-sm font-bold
                    shadow-[0_6px_20px_rgba(206,148,46,0.32)]
                    hover:shadow-[0_8px_24px_rgba(206,148,46,0.45)]
                    transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0
                    disabled:opacity-65 disabled:cursor-not-allowed cursor-pointer
                  "
                >
                  <span>
                    {createLead.isPending
                      ? "Booking..."
                      : "Book My Free Demo Class"}
                  </span>
                  <ArrowRight className="size-4 stroke-[2.4]" />
                </button>

                {/* Card Bottom Trust Strip: stacked on small phones so nothing wraps awkwardly */}
                <div
                  className={`pt-2 flex flex-col items-center gap-1.5 min-[400px]:flex-row min-[400px]:justify-center min-[400px]:gap-4 text-[11px] font-medium ${isDark ? "text-[#A9B2C3]" : "text-[#555C68]"
                    }`}
                >
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <ShieldCheck
                      className="size-3.5 text-[#D49B35] dark:text-[#E2B355]"
                      strokeWidth={2.2}
                    />
                    No payment required
                  </span>
                  <span
                    className={`hidden min-[400px]:block h-3 w-[1px] ${isDark ? "bg-white/15" : "bg-[#DCE3EE]"
                      }`}
                    aria-hidden="true"
                  />
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Clock
                      className="size-3.5 text-[#D49B35] dark:text-[#E2B355]"
                      strokeWidth={2.2}
                    />
                    45-minute live session
                  </span>
                </div>
              </form>

              {/* Success Overlay */}
              <div
                aria-hidden={!submitted}
                className={`absolute inset-0 flex items-center justify-center rounded-[22px] transition-all duration-300 ${isDark ? "bg-[#071531]" : "bg-white"
                  } ${submitted
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                  }`}
              >
                <div className="text-center p-6">
                  <div className="size-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                    <CircleCheckBig className="size-7" />
                  </div>
                  <h4
                    className={`text-xl font-bold mb-1 ${isDark ? "text-white" : "text-[#071B41]"
                      }`}
                  >
                    Demo Booked Successfully!
                  </h4>
                  <p
                    className={`text-sm ${isDark ? "text-[#C1C4CC]" : "text-[#555C68]"
                      }`}
                  >
                    Our team will reach out via WhatsApp to confirm your
                    preferred session time.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ================= 4 BENEFITS ================= */}
          <div className="lg:col-span-6 lg:col-start-1 lg:row-start-2 lg:self-start">
            {/* Only shown when the benefits sit below the form (phones / tablets) */}
            <h3
              className={`lg:hidden text-center text-xl font-bold font-[family-name:var(--font-playfair)] mb-5 ${isDark ? "text-white" : "text-[#071B41]"
                }`}
            >
              What you&apos;ll get
            </h3>

            {/* 1 column on phones, 2x2 on tablets, single list on desktop */}
            <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-6 lg:grid-cols-1 lg:gap-y-5 text-left max-w-[460px] sm:max-w-[720px] lg:max-w-[460px] mx-auto lg:mx-0">
              {demoBenefits.map(({ title, description, Icon }) => (
                <div key={title} className="flex items-start gap-3.5 sm:gap-4">
                  <div
                    className={`size-10 sm:size-11 rounded-full shrink-0 flex items-center justify-center border mt-0.5 ${isDark
                      ? "bg-[#112244] border-[#E2B355]/25 text-[#E2B355]"
                      : "bg-[#FDF4E1] border-[#F5E1B8] text-[#C58927]"
                      }`}
                  >
                    <Icon className="size-4 sm:size-5" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <h3
                      className={`text-sm sm:text-[15px] font-bold leading-snug ${isDark ? "text-white" : "text-[#071B41]"
                        }`}
                    >
                      {title}
                    </h3>
                    <p
                      className={`text-[13px] leading-relaxed mt-0.5 ${isDark ? "text-[#A9B2C3]" : "text-[#555C68]"
                        }`}
                    >
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Left Bottom Trust Strip */}
            <div
              className={`hidden lg:flex mt-8 pt-6 border-t items-center gap-5 text-xs font-medium ${isDark
                ? "border-white/10 text-[#C1C4CC]"
                : "border-[#E5E9F0] text-[#555C68]"
                }`}
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck
                  className="size-4 text-[#D49B35] dark:text-[#E2B355]"
                  strokeWidth={2.2}
                />
                No payment required
              </span>
              <span
                className={`h-3.5 w-[1px] ${isDark ? "bg-white/15" : "bg-[#DCE3EE]"
                  }`}
                aria-hidden="true"
              />
              <span className="inline-flex items-center gap-2">
                <Clock
                  className="size-4 text-[#D49B35] dark:text-[#E2B355]"
                  strokeWidth={2.2}
                />
                45-minute live session
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}