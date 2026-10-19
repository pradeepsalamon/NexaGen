"use client";

import { useState } from "react";
import { Check, CircleCheckBig } from "lucide-react";
import type { LeadExperienceLevel } from "@nexa-chess/types";
import { useCreateLeadMutation } from "../hooks/useLeadPublicApi";

const benefits = [
  "No payment required for demo",
  "Personalized assessment included",
  "Meet your potential coach",
  "Get a custom learning roadmap"
];

export function DemoBookingSection() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    parentName: "",
    age: "",
    experience: "",
    phone: ""
  });

  const createLead = useCreateLeadMutation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phone = formData.phone.replace(/\D/g, "");

    if (!/^\d{10}$/.test(phone)) {
      setError("Contact number must be exactly 10 digits.");
      return;
    }

    setError("");

    createLead.mutate(
      {
        studentName: formData.name,
        parentName: formData.parentName,
        studentAge: Number(formData.age),
        experienceLevel: formData.experience as LeadExperienceLevel,
        phone
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          setTimeout(() => setSubmitted(false), 4000);
          setFormData({ name: "", parentName: "", age: "", experience: "", phone: "" });
        },
        onError: () => {
          setError("Failed to register. Please try again or contact via WhatsApp.");
        }
      }
    );
  };

  return (
    <section id="demo" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#f8fafc] to-white" />
      <div className="hidden md:block absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-[#1a3a52]/[0.05] rounded-full blur-[90px]" />
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="reveal reveal-up" style={{ transitionDelay: "0s" }}>
            <span className="eyebrow mb-5">
              <span className="eyebrow-dot" />
              Free Trial Class
            </span>
            <h2 className="section-title font-[family-name:var(--font-playfair)] mb-6">
              Book Your <span className="gold-text">Free Demo</span> Class
            </h2>
            <p className="text-text-secondary text-lg leading-relaxed mb-8">
              Experience our world-class coaching firsthand. No commitment required — just pure
              chess learning with our expert instructors. See why thousands of parents trust us.
            </p>

            <div className="space-y-4">
              {benefits.map((text, i) => (
                <div
                  key={text}
                  className="flex items-center gap-3.5 reveal reveal-up"
                  style={{ transitionDelay: `${0.3 + i * 0.1}s` }}
                >
                  <span className="w-7 h-7 rounded-full bg-[#1a3a52]/[0.08] border border-[#1a3a52]/15 flex items-center justify-center text-[#1a3a52] shrink-0">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-text-secondary">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="reveal reveal-up" style={{ transitionDelay: "0.2s" }}>
            <div className="relative rounded-2xl glass-strong p-6 sm:p-8 shadow-[0_30px_70px_-40px_rgba(15,31,47,0.55)]">
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-[#1a3a52]/[0.07] via-transparent to-[#d4a843]/[0.07] pointer-events-none" />

              <div className="relative">
                <h3 className="text-xl font-bold font-[family-name:var(--font-playfair)] mb-6 gold-text">
                  Register for Free Demo
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="student-name" className="field-label">
                      Student Name
                    </label>
                    <input
                      id="student-name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="field"
                      placeholder="Enter student name"
                    />
                  </div>

                  <div>
                    <label htmlFor="parent-name" className="field-label">
                      Parent Name
                    </label>
                    <input
                      id="parent-name"
                      type="text"
                      required
                      value={formData.parentName}
                      onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                      className="field"
                      placeholder="Enter parent name"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="student-age" className="field-label">
                        Student Age
                      </label>
                      <input
                        id="student-age"
                        type="number"
                        required
                        min="1"
                        value={formData.age}
                        onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                        className="field"
                        placeholder="Age"
                      />
                    </div>
                    <div>
                      <label htmlFor="experience-level" className="field-label">
                        Experience Level
                      </label>
                      <select
                        id="experience-level"
                        required
                        value={formData.experience}
                        onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                        className="field appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%234a5f7f%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')] bg-[length:1rem_1rem] bg-[right_0.85rem_center] bg-no-repeat pr-9"
                      >
                        <option value="">Select</option>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-phone" className="field-label">
                      Contact Number
                    </label>
                    <input
                      id="contact-phone"
                      type="tel"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      maxLength={10}
                      value={formData.phone}
                      onChange={(e) => {
                        const phone = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setFormData({ ...formData, phone });
                      }}
                      className="field"
                      placeholder="10 digit contact number"
                    />
                  </div>

                  {error && (
                    <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={createLead.isPending}
                    className="w-full btn-gold !py-3.5 rounded-xl text-base font-bold tracking-wide mt-2 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95 transition-transform"
                  >
                    {createLead.isPending ? "Booking..." : "♞ Book Free Demo Class"}
                  </button>
                </form>

                <div
                  aria-hidden={!submitted}
                  className={`absolute inset-0 flex items-center justify-center bg-white/95 rounded-2xl backdrop-blur-sm transition-all duration-500 transform ${submitted ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`}
                >
                  <div aria-live="polite" className="text-center p-6" role="status">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 mb-4 animate-bounce">
                      <CircleCheckBig className="w-8 h-8" strokeWidth={2} />
                    </div>
                    <h4 className="text-xl font-bold text-text-primary mb-2">Demo Booked Successfully!</h4>
                    <p className="text-sm text-text-secondary">We&apos;ll contact you shortly on WhatsApp</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
