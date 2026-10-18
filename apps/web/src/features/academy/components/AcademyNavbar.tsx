"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const navItems = [
  { label: "Home", href: "#home" },
  { label: "Programs", href: "#programs" },
  { label: "Class Types", href: "#class-types" },
  { label: "About Us", href: "#why-choose-us" },
  { label: "Demo Classes", href: "#demo" },
  { label: "Training", href: "#sunday-training" },
  { label: "Contact", href: "#contact" }
];

export function AcademyNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled((prev) => {
          const next = window.scrollY > 50;
          return prev === next ? prev : next;
        });
        ticking = false;
      });
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b-[3px] border-[#1a3a52] reveal reveal-up ${
        scrolled
          ? "py-0 bg-white/95 md:bg-white/85 md:backdrop-blur-md shadow-[0_10px_30px_-18px_rgba(15,31,47,0.55)]"
          : "py-2 bg-white shadow-[0_6px_24px_-20px_rgba(15,31,47,0.5)]"
      }`}
      style={{ transitionDelay: "0s" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 xl:h-20">
          <a href="#home" className="flex items-center gap-3 group hover:scale-105 transition-transform">
            <Image
              src="/academy/nexa_logo_light1.png"
              alt="Nexa Chess Academy Logo"
              width={180}
              height={68}
              priority
              sizes="(min-width: 1280px) 200px, 140px"
              className="h-10 xl:h-14 w-auto object-contain drop-shadow-lg"
            />
          </a>

          <div className="hidden xl:flex items-center gap-0.5">
            {navItems.map((item) => (
              <div key={item.label} className="flex items-center">
                <a href={item.href} className="nav-link group">
                  {item.label}
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#1a3a52] to-transparent group-hover:w-[65%] transition-all duration-300" />
                </a>
              </div>
            ))}
          </div>

          <div className="hidden xl:flex items-center gap-3">
            <a
              href="#demo"
              className="btn-gold text-sm !py-2.5 !px-6 rounded-full hover:scale-105 active:scale-95 transition-transform"
            >
              Book Free Demo
            </a>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="xl:hidden flex flex-col gap-1.5 p-2.5 rounded-xl border border-[#e2e8f0] hover:bg-[#1a3a52]/5 transition-colors"
            aria-label="Toggle menu"
          >
            <span
              className={`block w-5 h-[2px] rounded-full bg-[#1a3a52] origin-center transition-all duration-300 ${mobileOpen ? "rotate-45 translate-y-[7px]" : ""}`}
            />
            <span
              className={`block w-5 h-[2px] rounded-full bg-[#1a3a52] transition-all duration-300 ${mobileOpen ? "opacity-0" : "opacity-100"}`}
            />
            <span
              className={`block w-5 h-[2px] rounded-full bg-[#1a3a52] origin-center transition-all duration-300 ${mobileOpen ? "-rotate-45 -translate-y-[7px]" : ""}`}
            />
          </button>
        </div>
      </div>

      <div
        className={`xl:hidden glass-strong border-t border-[#1a3a52]/10 overflow-hidden transition-all duration-300 ease-in-out ${mobileOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-4 py-6 space-y-1">
          {navItems.map((item, i) => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`block px-4 py-3 text-sm font-medium text-[#4a5f7f] hover:text-[#1a3a52] hover:bg-[#1a3a52]/[0.06] rounded-xl transition-all duration-300 transform ${mobileOpen ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"}`}
              style={{ transitionDelay: mobileOpen ? `${i * 50}ms` : "0ms" }}
            >
              {item.label}
            </a>
          ))}
          <a
            href="#demo"
            onClick={() => setMobileOpen(false)}
            className={`block btn-gold text-center mt-4 rounded-full transition-all duration-300 transform ${mobileOpen ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"}`}
            style={{ transitionDelay: mobileOpen ? `${navItems.length * 50}ms` : "0ms" }}
          >
            Book Free Demo
          </a>
        </div>
      </div>
    </nav>
  );
}
