"use client";

import { useRevealFormErrors } from "@/hooks/useRevealFormErrors";
import { useState } from "react";
import { useToast } from "@/providers/ToastProvider";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleCheckBig,
  Clock,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserRound,
  Users
} from "lucide-react";
import { createLeadRequestSchema, type LeadExperienceLevel } from "@nexa-chess/types";
import { adMeasurementAllowed } from "@/features/ad-consent/lib/adConsent";
import { adConsentSettled } from "@/features/ad-consent/lib/consentSync";
import { newMetaEventId, trackMetaPixel } from "@/features/ad-consent/lib/metaPixel";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { readReferralCode } from "@/features/referrals/lib/referralStorage";
import { useCreateLeadMutation } from "../hooks/useLeadPublicApi";
import { Section, SectionHeader } from "./parts";

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
  { value: "beginner", label: "Beginner level", hint: "New to chess" },
  {
    value: "intermediate",
    label: "Intermediate level",
    hint: "Knows the basics & tactics"
  },
  {
    value: "advanced",
    label: "Advanced level",
    hint: "Competitive tournament player"
  }
];

export function DemoBookingSection() {

  const [submitted, setSubmitted] = useState(false);
  // Field problems go under their field (v2) or a toast (the original page); a failed send is a toast.
  const [error, setError] = useState<{ field: "age" | "email" | "fullName" | "phone"; message: string } | null>(null);
  useRevealFormErrors(error);
  const errorFor = (field: "age" | "email" | "fullName" | "phone") => (error?.field === field ? error.message : undefined);
  const toast = useToast();
  const [formData, setFormData] = useState({
    fullName: "",
    parentName: "",
    email: "",
    phone: "",
    age: "",
    program: "beginner"
  });

  const createLead = useCreateLeadMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = formData.phone.replace(/\D/g, "");

    if (cleanPhone.length !== 10) {
      setError({ field: "phone", message: "Enter a 10-digit mobile number" });
      return;
    }

    const studentName = formData.fullName.trim();
    if (!studentName) {
      setError({ field: "fullName", message: "Enter the student's name" });
      return;
    }

    const parentName = formData.parentName.trim() || studentName;
    const studentAge = Number(formData.age);
    if (!Number.isInteger(studentAge) || studentAge < 3 || studentAge > 99) {
      setError({ field: "age", message: "Enter an age from 3 to 99" });
      return;
    }
    const experienceLevel = (formData.program || "beginner") as LeadExperienceLevel;

    const email = formData.email.trim();
    // The API's own rule (createLeadRequestSchema), so the two never disagree.
    if (email && !createLeadRequestSchema.shape.email.safeParse(email).success) {
      setError({ field: "email", message: "Enter a valid email, or leave it blank" });
      return;
    }

    setError(null);

    // After the banner's Accept: the pixel's Lead and the server's share one id (docs/AD_MEASUREMENT.md).
    const metaEventId = adMeasurementAllowed() ? newMetaEventId() : undefined;
    // An Accept still on its way to the server must reach the visit before the lead does.
    if (metaEventId) await adConsentSettled();
    createLead.mutate(
      {
        studentName,
        parentName,
        studentAge,
        experienceLevel,
        phone: cleanPhone,
        email,
        // From a /r/<code> visit; the API prefers its own attribution cookie.
        referralCode: readReferralCode(),
        metaEventId
      },
      {
        onSuccess: () => {
          if (metaEventId) trackMetaPixel("Lead", {}, metaEventId);
          setSubmitted(true);
          setTimeout(() => setSubmitted(false), 5000);
          setFormData({
            fullName: "",
            parentName: "",
            email: "",
            phone: "",
            age: "",
            program: "beginner"
          });
        },
        onError: () => {
          toast.error({ message: "Please try again, or reach us on WhatsApp.", title: "We couldn't book your demo" });
        }
      }
    );
  };

  const selectedProgram =
    programOptions.find((o) => o.value === formData.program) ?? programOptions[0];

  return (
    <Section id="demo" labelledBy="demo-heading" tone="surface">
      {/* Phones: heading, form, then benefits (the form is reachable right away). From lg: heading and benefits on the left, the form beside them. */}
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8">
        <div className="lg:col-span-6 lg:col-start-1 lg:row-start-1">
          <SectionHeader
            align="left"
            description="Experience our live coaching methodology with zero commitment. Meet our coaches, evaluate your chess skills, and get a tailored learning roadmap."
            eyebrow="Free evaluation"
            id="demo-heading"
            title="Book your free demo class"
          />
        </div>
        <div className="grid gap-4 lg:col-span-6 lg:col-start-1 lg:row-start-2">
            <h3 className="text-base font-semibold text-app-text">What you&apos;ll get</h3>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              {demoBenefits.map(({ description, Icon, title }) => (
                <li className="flex items-start gap-3" key={title}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-ink">
                    <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
                  </span>
                  <span className="grid gap-0.5">
                    <span className="text-sm font-semibold text-app-text">{title}</span>
                    <span className="text-sm text-app-muted">{description}</span>
                  </span>
                </li>
              ))}
            </ul>
        </div>

        <div className="row-start-2 rounded-panel border border-app-border bg-app-background p-5 shadow-card sm:p-8 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center" role="status">
              <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success-ink">
                <CircleCheckBig aria-hidden="true" className="size-6" strokeWidth={2.25} />
              </span>
              <h3 className="text-xl font-bold text-app-text">Demo booked</h3>
              <p className="text-sm text-app-muted">
                Our team will reach out via WhatsApp to confirm your preferred session time.
              </p>
            </div>
          ) : (
            <>
              <h3 className="text-xl font-bold text-app-text">Register for a free demo</h3>
              <p className="mt-1 text-sm text-app-muted">
                Fill in your details and our team will schedule your personalized class.
              </p>
              <form className="mt-6 grid gap-4" noValidate onSubmit={handleSubmit}>
                <FormField error={errorFor("fullName")} id="demo-full-name" label="Student's full name" required>
                  <Input
                    hasError={Boolean(errorFor("fullName"))}
                    autoComplete="off"
                    enterKeyHint="next"
                    id="demo-full-name"
                    leadingIcon={<UserRound strokeWidth={2.25} />}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="e.g. Aarav Sharma"
                    required
                    type="text"
                    value={formData.fullName}
                  />
                </FormField>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <FormField id="demo-parent-name" label="Parent or guardian (optional)">
                    <Input
                      autoComplete="name"
                      enterKeyHint="next"
                      id="demo-parent-name"
                      leadingIcon={<UserRound strokeWidth={2.25} />}
                      onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                      placeholder="e.g. Rajesh Sharma"
                      type="text"
                      value={formData.parentName}
                    />
                  </FormField>
                  <FormField error={errorFor("age")} id="demo-student-age" label="Age">
                    <Input
                      autoComplete="off"
                      enterKeyHint="next"
                      hasError={Boolean(errorFor("age"))}
                    id="demo-student-age"
                      inputMode="numeric"
                      leadingIcon={<CalendarDays strokeWidth={2.25} />}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                        setFormData({ ...formData, age: digits });
                      }}
                      pattern="[0-9]*"
                      placeholder="10"
                      type="text"
                      value={formData.age}
                    />
                  </FormField>
                </div>

                <FormField error={errorFor("email")} id="demo-email" label="Email address (optional)">
                  <Input
                    autoComplete="email"
                    enterKeyHint="next"
                    hasError={Boolean(errorFor("email"))}
                    id="demo-email"
                    inputMode="email"
                    leadingIcon={<Mail strokeWidth={2.25} />}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. parent@example.com"
                    type="email"
                    value={formData.email}
                  />
                </FormField>

                <FormField error={errorFor("phone")} id="demo-phone" label="Phone number (10 digits)" required>
                  <Input
                    autoComplete="tel-national"
                    enterKeyHint="next"
                    hasError={Boolean(errorFor("phone"))}
                    id="demo-phone"
                    inputMode="numeric"
                    leadingIcon={<Phone strokeWidth={2.25} />}
                    maxLength={10}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setFormData({ ...formData, phone: digits });
                    }}
                    pattern="[0-9]*"
                    placeholder="9876543210"
                    required
                    type="tel"
                    value={formData.phone}
                  />
                </FormField>

                <FormField hint={selectedProgram.hint} id="demo-program" label="Program">
                  <Select
                    id="demo-program"
                    onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                    options={programOptions.map(({ label, value }) => ({ label, value }))}
                    value={formData.program}
                  />
                </FormField>

                <Button fullWidth isLoading={createLead.isPending} size="lg" type="submit">
                  {createLead.isPending ? "Booking…" : "Book my free demo class"}
                </Button>

                <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm text-app-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck aria-hidden="true" className="size-4 text-success-ink" strokeWidth={2.25} />
                    No payment required
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock aria-hidden="true" className="size-4 text-primary-ink" strokeWidth={2.25} />
                    45-minute live session
                  </span>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
