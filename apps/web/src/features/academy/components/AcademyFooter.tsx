"use client";

import Image from "next/image";
import { ChevronRight, Phone, Mail, Globe } from "lucide-react";

const quickLinks = [
  { label: "Home", href: "#home" },
  { label: "Programs", href: "#programs" },
  { label: "Class Types", href: "#class-types" },
  { label: "About Us", href: "#why-choose-us" },
  { label: "Demo Classes", href: "#demo" },
  { label: "Contact", href: "#contact" }
];

const programs = [
  { label: "Beginner Level", href: "#programs" },
  { label: "Intermediate Level", href: "#programs" },
  { label: "Advanced Level", href: "#programs" },
  { label: "Sunday Training", href: "#sunday-training" }
];

const contactEmail = "nexachessacademy@gmail.com";

export function AcademyFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#0f172a] text-white">
      <div className="h-[3px] bg-gradient-to-r from-[#b8912e] via-[#d4a843] to-[#b8912e] w-full" />

      <div className="absolute inset-0 chess-pattern opacity-5 pointer-events-none" />
      <div className="hidden md:block absolute -top-24 left-1/4 w-[520px] h-[520px] bg-[#2a5a8a]/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-4 gap-10">
          <div
            className="md:col-span-1 reveal reveal-up flex flex-col items-center text-center md:items-start md:text-left"
            style={{ transitionDelay: "0s" }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/academy/nexa_logo_dark1.png"
                alt="Nexa Chess Academy Logo"
                width={180}
                height={68}
                loading="lazy"
                className="h-14 md:h-16 w-auto object-contain drop-shadow-lg"
              />
            </div>
            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              Professional online chess training for students of all levels. Building champions since 2018.
            </p>
          </div>

          <div className="reveal reveal-up" style={{ transitionDelay: "0.1s" }}>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white mb-4">Quick Links</h3>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-slate-300 hover:text-amber-400 transition-colors duration-300 flex items-center gap-1.5 group"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-amber-400/60 transition-transform duration-300 group-hover:translate-x-1" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="reveal reveal-up" style={{ transitionDelay: "0.2s" }}>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white mb-4">Programs</h3>
            <ul className="space-y-2.5">
              {programs.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-slate-300 hover:text-amber-400 transition-colors duration-300 flex items-center gap-1.5 group"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-amber-400/60 transition-transform duration-300 group-hover:translate-x-1" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="reveal reveal-up" style={{ transitionDelay: "0.3s" }}>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white mb-4">Contact Info</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Phone className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" strokeWidth={1.75} />
                +91 7010854643
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Mail className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" strokeWidth={1.75} />
                <a href={`mailto:${contactEmail}`} className="hover:text-amber-400 transition-colors break-all">
                  {contactEmail}
                </a>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-300">
                <Globe className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" strokeWidth={1.75} />
                Available Worldwide
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 reveal reveal-up"
          style={{ transitionDelay: "0.4s" }}
        >
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Nexa Chess Academy. All Rights Reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-slate-400 hover:text-amber-400 transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="text-xs text-slate-400 hover:text-amber-400 transition-colors">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
