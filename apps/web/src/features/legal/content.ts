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
        detail: "Name, email, username, phone number, profile picture, time zone and your role (student, coach or admin; an admin may also be allowed to teach, and that change is recorded with who made it and when). If you registered yourself, when you accepted these terms and this policy, and which version.",
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
          "When you joined and left each class, chat messages you sent, puzzle attempts, class questions you answered, games you played against the computer in class, homework results, course progress, poll answers, tournaments you entered or helped run, and your puzzle rating and practice streak.",
        label: "Classes and learning"
      },
      {
        detail:
          "Every move a student plays on a board in the app (live classes, puzzles, homework, Puzzle Storm and Racer, tournaments, their own imported games, and the class board while they have control) is recorded, and each night our own chess engine, on our own server, reviews it for mistakes, better moves and missed tactics. The student, their coach and academy admins see the review. There is no switch for this: it is part of how the academy teaches.",
        label: "Board moves and engine review"
      },
      {
        detail:
          "Each Monday, a short report of the student's week (classes attended, homework, puzzles and practice, reviewed play and the tactic they miss most) is made from the records above and kept in the student's own account, where the student, their coach and academy admins can read it. It is not sent anywhere.",
        label: "Weekly progress reports"
      },
      {
        detail:
          "Only for a student whose switch is on (Profile → \"AI comments on my play\", with a parent or guardian's agreement, or turned on by their coach or an admin after a parent agreed), and only if the academy turns it on: short coach-style comments on that student's play, written by an outside AI service. Who changed the switch, and when, is recorded. Switching it off stops this at once and deletes those comments.",
        label: "Outside-AI comments (students who switch it on)"
      },
      {
        detail:
          "What you search for in the help centre (without your name: only your role and batch, the page you searched from, how many results it found and when), and whether you marked a help article helpful. Coaches can suggest help articles; those suggestions are kept with their name.",
        label: "Help centre"
      },
      {
        detail:
          "Classes run over live video and audio. A coach may record a class; recordings include the video, audio and chessboard of everyone present.",
        label: "Class video and recordings"
      },
      {
        detail:
          "If the academy turns it on for a class and the coach has agreed, the coach's own speech is turned into text during the class and kept as a transcript. Only the coach's microphone is used: students are never transcribed, though a voice the coach's microphone picks up in the room may appear in the text. Only that coach and academy admins can read it. No audio is kept.",
        label: "Class transcripts (coaches)"
      },
      {
        detail:
          "If the academy turns it on, a class's transcript is used to draft a short recap of the class for its students: what was covered, the key ideas and what to practise. Students' names are replaced with codes before an AI model reads the text, and the recap never names a student. The model runs on the academy's own server unless the academy chooses an outside AI service. The class's coach or an academy admin reviews and can edit every recap; students see it only after it is published, always marked as prepared with AI assistance.",
        label: "AI class recaps"
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
          "On the academy website: a visitor cookie (kept for a year) and a session cookie, with your IP address, browser, device type, the page you arrived from and any campaign tags in the link, and your answer on the cookie banner (kept for six months). If you book a demo, the student's name and age, the parent's name, phone number and (if given) email address, and chess experience.",
        label: "Website visits and demo bookings"
      },
      {
        detail:
          "If you message the academy's WhatsApp support number: your WhatsApp number and profile name, the messages you and our team exchange, and what you tell the assistant (for example the student's name and the details of your request). Card numbers and one-time codes are removed from a message before it is stored. Only academy admins read these conversations. A first message from a number that isn't a student's or parent's may also start an enquiry record (the number, the WhatsApp profile name and, if you came from one of our ads, which ad), which our sales team works from.",
        label: "WhatsApp support"
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
      {
        detail:
          "Class reminders and invoices may be sent over WhatsApp (Meta), and support conversations on the academy's WhatsApp number go through it. Reply STOP to stop reminders and updates there.",
        label: "WhatsApp"
      },
      { detail: "Account and class emails, and emails academy staff write to you, are sent through our email provider.", label: "Email" },
      {
        detail:
          "If a student links an account, its username is sent to that site to read the student's public games. With automatic sync on, which the academy or a coach can require, this happens about once a day until the account is unlinked.",
        label: "Lichess and Chess.com"
      },
      {
        detail:
          "For a class transcript, the coach's Chrome browser sends the coach's microphone audio to Google's speech service to turn it into text. This happens only for a coach who has agreed, and never for a student's microphone.",
        label: "Google (speech recognition in Chrome)"
      },
      {
        detail:
          "Only for a student whose outside-AI switch is on: the board positions and moves of their play and what our engine found are sent to an outside AI service to write comments. Never a name, email, account id, class, batch or academy. The service may keep what it is sent under its own terms. None is in use yet; the service is named here before anything is sent.",
        label: "Outside AI service (AI play review)"
      },
      {
        detail:
          "Only if an academy chooses an outside AI service for its class recaps instead of its own server: the coach's class transcript, with every student's and the coach's name replaced by a code and any spoken email address or phone number removed, is sent to that service to draft the recap. We add no account id, batch or academy to it; anything else the coach says aloud stays in the text. The service in use is Groq (groq.com); it may keep what it is sent under its own terms. Any other service is named here before anything is sent to it.",
        label: "Outside AI service (class recaps): Groq"
      },
      {
        detail:
          "Error reports go to Sentry with only an internal user ID and your role — never your name, email or messages.",
        label: "Sentry"
      },
      {
        detail:
          "To measure our Facebook and Instagram ads: the Meta Pixel on the website if you accept it, and a few events from our server about enquiries that came from our ads. What is sent, and how to say no, is under \"Ad measurement\" below.",
        label: "Meta (ads)"
      }
    ],
    paragraphs: [
      "Your coaches and academy staff see what they need to teach and run your classes. We do not sell your data. The only advertising tool is Meta's (see \"Ad measurement\"); the website uses no other third-party advertising or analytics trackers."
    ],
    title: "Who we share it with"
  },
  {
    id: "ad-measurement",
    items: [
      {
        detail:
          "Only if you press Accept on the cookie banner, on our public pages (never inside the app, in a class or on another academy's site). It tells Meta the pages you view and that you sent the demo form, and Meta sets its own cookie (_fbp). Without Accept nothing from Meta loads.",
        label: "Meta Pixel (website)"
      },
      {
        detail:
          "If you booked a demo on the website after accepting: that an enquiry was made, a demo was booked or a student enrolled (with the amount paid), together with the parent's phone number and email scrambled (hashed) so they can't be read, your IP address and browser, and the ad click details from your link or Meta's cookie.",
        label: "From our server, for website enquiries"
      },
      {
        detail:
          "If you wrote to us on WhatsApp by tapping one of our ads: the same events, with only the click id Meta gave that conversation and our WhatsApp account's id. No phone number, name or message is sent.",
        label: "From our server, for WhatsApp ad enquiries"
      },
      {
        detail: "A child's name, age or chess level, anything from a student's account, and any message you write.",
        label: "Never sent to Meta"
      }
    ],
    paragraphs: [
      "You can decline on the banner, or change your answer later with \"Change cookie choices\" on this page. After you decline, we also stop sending the website events about your visits, including any not yet sent."
    ],
    title: "Ad measurement"
  },
  {
    id: "how-long",
    items: [
      { detail: "Removed a day after they expire.", label: "Sign-in sessions and reset links" },
      { detail: "Removed after 180 days of inactivity unless you booked a demo.", label: "Website visit records" },
      { detail: "Removed after 90 days.", label: "Help-centre searches" },
      { detail: "Our record of what was sent to Meta is removed after 180 days.", label: "Ad measurement events" },
      { detail: "Removed after 30 days.", label: "Class transcripts" },
      { detail: "Kept with the class they describe; a coach or admin can unpublish one at any time.", label: "AI class recaps" },
      { detail: "Our copy is removed after a year.", label: "Emails academy staff write to you" },
      {
        detail: "Engine reviews of a student's play, and any outside-AI comments on them, are removed after a year. The moves themselves are kept with the class, puzzle or game they belong to.",
        label: "Engine reviews and AI comments"
      },
      { detail: "Removed after a year.", label: "Weekly progress reports" },
      {
        detail:
          "A conversation and its requests are removed a year after the conversation ends, unless a request is still open. The raw delivery records from WhatsApp are removed after 30 days.",
        label: "WhatsApp support conversations"
      },
      {
        detail:
          "Kept for the period the academy sets for each kind of record. Anything older is removed every night. Until a period is set, they are kept.",
        label: "Chat messages, class chat, notifications, message logs and activity records"
      },
      {
        detail: "Can be restored for 30 days, then permanently removed — except records we must keep (below).",
        label: "Deleted accounts"
      },
      { detail: "Invoices, payments and payroll records are kept as tax law requires.", label: "Financial records" }
    ],
    pending: "How long class recordings and learning records are kept, and the legal basis for keeping financial records.",
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
    id: "browser",
    items: [
      {
        detail: "Kept in cookies the page's own scripts can't read, and ended when you sign out or the session expires.",
        label: "Sign-in"
      },
      {
        detail:
          "Your account id, first name, role, profile photo link and time zone, so the app opens straight away. Your email, phone, date of birth and parent details are never kept in the browser; they are loaded fresh each visit.",
        label: "Who is signed in"
      },
      {
        detail:
          "Theme, text size, board look, camera and microphone choice, video background and class layout, kept on this device only.",
        label: "Your settings"
      },
      {
        detail:
          "A referral code or ad link you arrived with, until you sign up, and unsaved drafts such as game notes.",
        label: "Sign-up source and drafts"
      }
    ],
    paragraphs: ["Signing out ends the session; clearing your browser's site data removes everything listed here."],
    title: "What your browser keeps"
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
    id: "board-play",
    paragraphs: [
      "The moves a student plays on boards in the app are recorded and reviewed each night by the academy's own chess engine, so the student and their coaches can see what to work on. Short comments from an outside AI service are added only for a student whose switch is on, with a parent or guardian's agreement, and can be switched off at any time. See the privacy policy for what is kept and shared."
    ],
    title: "Board play and AI review"
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
