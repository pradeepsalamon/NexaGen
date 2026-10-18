import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, LEGAL_DRAFT, type LegalSection } from "../content";

type LegalPageProps = {
  title: string;
  intro: string;
  sections: LegalSection[];
  other: { href: string; label: string };
};

/** Server-rendered privacy/terms layout: contents list, sections, contact. */
export function LegalPage({ intro, other, sections, title }: LegalPageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {LEGAL_DRAFT ? (
        <div className="mb-8 rounded-panel border border-warning/35 bg-warning/[0.08] p-4 text-sm text-warning-ink" role="note">
          <strong>Draft.</strong> This page is being finalised and is not yet in effect. Sections marked
          &ldquo;to be completed&rdquo; are waiting for review.
        </div>
      ) : null}

      <h1 className="text-3xl font-extrabold leading-tight text-app-text sm:text-4xl">{title}</h1>
      <p className="mt-3 text-base leading-7 text-app-muted">{intro}</p>

      <nav aria-label="On this page" className="mt-8 rounded-panel border border-app-border bg-app-surface p-4">
        <p className="text-xs font-bold text-app-muted">On this page</p>
        <ol className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.id}>
              <a className="text-primary-ink hover:underline" href={`#${section.id}`}>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {sections.map((section) => (
          <section aria-labelledby={`${section.id}-heading`} className="scroll-mt-24" id={section.id} key={section.id}>
            <h2 className="text-xl font-bold text-app-text" id={`${section.id}-heading`}>
              {section.title}
            </h2>
            {section.paragraphs?.map((paragraph) => (
              <p className="mt-3 leading-7 text-app-text" key={paragraph}>
                {paragraph}
              </p>
            ))}
            {section.items ? (
              <dl className="mt-4 space-y-3">
                {section.items.map((item) => (
                  <div className="rounded-control border border-app-border bg-app-surface p-3" key={item.label}>
                    <dt className="font-semibold text-app-text">{item.label}</dt>
                    <dd className="mt-1 text-sm leading-6 text-app-muted">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {section.pending ? (
              <p className="mt-3 rounded-control border border-dashed border-app-border p-3 text-sm italic text-app-muted">
                To be completed: {section.pending}
              </p>
            ) : null}
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-app-border pt-6 text-sm text-app-muted">
        <p>
          Questions? Email{" "}
          <a className="text-primary-ink hover:underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
        <p className="mt-2">
          See also the{" "}
          <Link className="text-primary-ink hover:underline" href={other.href}>
            {other.label}
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
