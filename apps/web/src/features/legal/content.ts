/**
 * Privacy policy and terms. The "facts" are what the code actually stores and
 * who it is shared with — keep them true when a feature changes. Sections with
 * `pending` hold no legal wording yet; replace them with reviewed text, then
 * set LEGAL_DRAFT to false (it drops the banner and the noindex).
 */
export const LEGAL_DRAFT = true;

export const LEGAL_CONTACT_EMAIL = "nexachessacademy@gmail.com";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: { label: string; detail: string }[];
  /** What the reviewed wording must cover; shown as a placeholder until written. */
  pending?: string;
};

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    pending:
      "The legal entity operating Nexa Chess Academy, its address, and who to contact about data protection (grievance officer under India's DPDP Act, if required).",
    title: "Who we are"
  },
  {
    id: "what-we-collect",
    items: [
      {
        detail: "Name, email, username, phone number, profile picture, time zone and your role (student, coach or admin).",
        label: "Your account"
      },
      {
        detail:
          "For students: date of birth, chess rating, FIDE ID, and a parent or guardian's name, email, phone number and relationship.",
        label: "Student details"
      },
      {
        detail:
          "For coaches: bio, qualifications, FIDE details and experience; for payroll, payment details, PAN and GSTIN.",
        label: "Coach details"
      },
      {
        detail:
          "When you joined and left each class, chat messages you sent, puzzle attempts, homework results, course progress, poll answers, and your puzzle rating and practice streak.",
        label: "Classes and learning"
      },
      {
        detail:
          "Classes run over live video and audio. A coach may record a class; recordings include the video, audio and chessboard of everyone present.",
        label: "Class video and recordings"
      },
      {
        detail:
          "Orders, payments, invoices, refunds, subscriptions and your billing name and address (and GSTIN, if you give one). Card and UPI details are entered with the payment provider; we never see or store them.",
        label: "Payments"
      },
      {
        detail:
          "The devices you are signed in on (browser and IP address), when you last signed in or were active, and a record of key actions such as signing in, joining a class or watching a recording.",
        label: "Sign-in and usage"
      },
      {
        detail:
          "On the academy website: a visitor cookie (kept for a year) and a session cookie, with your IP address, browser, device type, the page you arrived from and any campaign tags in the link. If you book a demo, the student's name and age, the parent's name, phone number and (if given) email address, and chess experience.",
        label: "Website visits and demo bookings"
      }
    ],
    title: "What we collect"
  },
  {
    id: "how-we-use",
    pending:
      "The purposes (running classes, attendance, progress, billing, coach payroll, reminders, support, security) and the legal basis or consent relied on for each, including verifiable parental consent for students under 18.",
    title: "How we use it"
  },
  {
    id: "who-we-share-with",
    items: [
      { detail: "Hosting, the database and backups run on servers we operate on Oracle Cloud.", label: "Oracle Cloud" },
      { detail: "Profile pictures, payment proofs and invoice PDFs are stored with Cloudinary.", label: "Cloudinary" },
      { detail: "Payments are processed by Razorpay, Cashfree or Stripe, depending on how you pay.", label: "Payment providers" },
      { detail: "Class reminders and invoices may be sent over WhatsApp (Meta).", label: "WhatsApp" },
      { detail: "Account and class emails are sent through our email provider.", label: "Email" },
      {
        detail:
          "Error reports go to Sentry with only an internal user ID and your role — never your name, email or messages.",
        label: "Sentry"
      }
    ],
    paragraphs: [
      "Your coaches and academy staff see what they need to teach and run your classes. We do not sell your data, and the website uses no third-party advertising or analytics trackers."
    ],
    title: "Who we share it with"
  },
  {
    id: "how-long",
    items: [
      { detail: "Removed a day after they expire.", label: "Sign-in sessions and reset links" },
      { detail: "Removed after 180 days of inactivity unless you booked a demo.", label: "Website visit records" },
      {
        detail: "Can be restored for 30 days, then permanently removed — except records we must keep (below).",
        label: "Deleted accounts"
      },
      { detail: "Invoices, payments and payroll records are kept as tax law requires.", label: "Financial records" }
    ],
    pending: "How long class recordings, chat and learning records are kept, and the legal basis for keeping financial records.",
    title: "How long we keep it"
  },
  {
    id: "your-rights",
    paragraphs: [
      "Signed in, go to Profile → \"Your data\" to download a copy of everything we hold about you, and Profile → \"Delete account\" to ask us to delete your account. You can correct most details yourself on your profile."
    ],
    pending:
      "Your rights under the laws that apply (DPDP Act; GDPR for users in the EU/UK; COPPA for children in the US), how a parent exercises them for a child, and how to complain to a regulator.",
    title: "Your choices and rights"
  },
  {
    id: "children",
    pending:
      "How the academy obtains and records verifiable parental consent before collecting a child's data, and what a parent can see and control.",
    title: "Children"
  },
  {
    id: "security",
    paragraphs: [
      "Passwords are stored only as salted hashes, staff accounts can use two-factor sign-in, sessions expire, and repeated wrong passwords lock an account for 15 minutes. Invoices and payment proofs are stored privately and only open through your signed-in account."
    ],
    title: "Security"
  },
  {
    id: "changes",
    pending: "How users are told about changes to this policy, and the date it takes effect.",
    title: "Changes to this policy"
  }
];

export const TERMS_SECTIONS: LegalSection[] = [
  { id: "agreement", pending: "Who the agreement is with and when it applies, including who agrees on a child's behalf.", title: "This agreement" },
  { id: "accounts", pending: "Account eligibility, keeping sign-in details safe, and the academy's right to approve coach accounts.", title: "Your account" },
  {
    id: "classes",
    paragraphs: [
      "Classes are scheduled by the academy. Coaches can ask for extra classes or new times, and the academy approves them."
    ],
    pending: "Attendance expectations, missed and cancelled classes, and conduct in live classes (chat, camera, microphone).",
    title: "Classes"
  },
  {
    id: "recordings",
    paragraphs: ["A coach may record a live class for students in that class to watch later."],
    pending: "Consent to being recorded, who may watch recordings, and that recordings may not be redistributed.",
    title: "Class recordings"
  },
  {
    id: "payments",
    paragraphs: [
      "Fees are shown before you pay, including tax. A monthly plan renews through the payment provider until it is cancelled. Every payment gets an invoice."
    ],
    pending: "Refund and cancellation policy, what happens on a failed renewal, and price changes.",
    title: "Fees, payments and refunds"
  },
  { id: "content", pending: "Ownership of course material, puzzles and recordings, and what users may do with them.", title: "Content" },
  { id: "ending", pending: "How either side can end the agreement, and what happens to the account and data.", title: "Ending the agreement" },
  { id: "liability", pending: "Limits of liability and disclaimers, as reviewed by counsel.", title: "Liability" },
  { id: "law", pending: "Governing law, jurisdiction, and how disputes are resolved.", title: "Governing law" }
];

// Turning the draft off while any section still has placeholder text would
// publish (and let search engines index) an unfinished policy: fail the build.
if (!LEGAL_DRAFT) {
  const unfinished = [...PRIVACY_SECTIONS, ...TERMS_SECTIONS].filter((section) => section.pending);
  if (unfinished.length > 0) {
    throw new Error(
      `LEGAL_DRAFT is false but these sections are still pending: ${unfinished.map((s) => s.id).join(", ")}`
    );
  }
}
