# Business Growth, Lead Velocity & Marketing Playbook

> **Target:** Nexa Chess Academy (`nexa-chess` / NexaGen)  
> **Date:** 2026-11-21  
> **Status:** Active Strategy & Implementation Playbook  
> **Related Docs:** [LEAD_STAGES.md](LEAD_STAGES.md), [WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md), [REFERRALS.md](REFERRALS.md), [UNIQUE_FEATURES_PROPOSAL.md](UNIQUE_FEATURES_PROPOSAL.md)

---

## 1. Executive Summary & Growth Objectives

The primary bottleneck in scaling an online chess academy is rarely teacher supply or curriculum quality—it is **lead velocity, demo attendance rates, and parental conversion**.

In the Indian EdTech and after-school enrichment market, parents make emotional decisions based on:
1. **Screen time concerns** (replacing video games/YouTube with cognitive focus).
2. **Academic & life skills** (patience, critical thinking, sportsmanship).
3. **Speed of response** (booking a trial before friction or doubt sets in).

This playbook defines the end-to-end strategy to maximize return on ad spend (ROAS), minimize lead drop-off, eliminate demo no-shows, and accelerate conversion from inquiry to paid enrollment.

---

## 2. Speed-to-Lead Architecture (WhatsApp + CRM)

Research shows that contacting a digital ad lead within **5 minutes** makes them **21x more likely to enter the sales pipeline** compared to waiting 30 minutes. 

Because Nexa's WhatsApp Cloud API connects directly to Frappe CRM (`docs/LEAD_STAGES.md`), the platform has a major structural advantage over competitors relying on manual telecalling.

```
[ Meta Ad Click / Website Form ]
               │
               ▼ (<10 seconds)
[ Frappe CRM Lead Ingestion ]
               │
               ▼ (Instant Trigger)
[ WhatsApp Interactive Booking Flow ]
   ├── Step 1: Child's Age Bracket
   ├── Step 2: Current Chess Familiarity
   └── Step 3: 1-Tap Demo Slot Selection (Today / Tomorrow / Weekend)
               │
               ▼
[ Calendar Booked + Instant Confirmation Template ]
```

### Key Automations to Enforce:
1. **The 3-Tap WhatsApp Demo Slot Selector:**
   * Instead of a static message asking them to wait, dispatch `demo_request_received_v2` with interactive buttons:
     * *Button 1:* "Today 5:00 PM"
     * *Button 2:* "Tomorrow 11:00 AM"
     * *Button 3:* "Choose Another Time"
2. **10-Second Website Form Catch:**
   * When a parent fills the demo form on `nexachess.in`, the API triggers an automated WhatsApp message within 10 seconds:
     > *"Hi Priya, we've received your request for Aarav! We have tentatively held a free 1-on-1 demo slot for this Saturday at 5:00 PM. Tap below to confirm or pick another time."*
3. **No Twin / Duplicate Handling:**
   * Existing numbers receive an update note in CRM (`CRM-LEAD`) rather than duplicate entries, appending recent campaign UTM attribution (`docs/LEAD_STAGES.md`).

---

## 3. High-Converting Meta Ads Framework (Click-to-WhatsApp)

Generic ads like *"Join Chess Classes - Enroll Now"* yield high cost-per-lead (CPL) and low intent. The following three targeted ad angles address core emotional buying triggers:

### Angle 1: "Screen Time Replacement" (Highest Converting for Ages 5–10)
* **Target Audience:** Parents of children aged 5–10; interests in Parenting, Child Development, STEM Education.
* **Core Hook:** *"Replace mindless iPad & YouTube gaming with Grandmaster strategy 🧠"*
* **Creative Asset:** Split-screen video or carousel:
  * *Left Side (Black & White):* Child zoned out staring at mobile gaming screens.
  * *Right Side (Vibrant Color):* Child smiling, leaning forward, focused over a chess board during a live interactive class.
* **Ad Copy:**  
  > *"Is screen time turning into wasted time? Chess develops focus, spatial memory, and patience in children within weeks. Give your child a superpower for school and life. Book a free 1-on-1 trial class today."*
* **CTA Button:** *"Book Free Trial on WhatsApp"* (Leverages the 72-hour free WhatsApp messaging window).

### Angle 2: "Academic Advantage & School Confidence"
* **Target Audience:** Parents aged 30–45; interests in Academics, Olympiads, CBSE/ICSE schools.
* **Core Hook:** *"Why teachers and top schools notice kids who play chess."*
* **Creative Asset:** Short coach introduction or testimonial showing problem-solving on the Nexa interactive board.
* **Bullet Points in Ad:**
  * Certified FIDE & Arena Grandmaster Coaches
  * Small Batches (Max 4–6 Students)
  * Weekly Academy Tournaments & Rating Badges
* **CTA Button:** *"Claim Free Assessment"*

### Angle 3: "Level-Specific Campaigns" (Segmented Ad Sets)
* **Ad Set A (Ages 5–7):** *"No Prior Knowledge Needed — Fun, Stories & Chess Fundamentals."*
* **Ad Set B (Ages 8–13):** *"For Kids Who Know the Moves: Learn Advanced Tactics, Pin Defense & Tournament Play."*

---

## 4. Landing Page Optimization (`nexachess.in`)

### 1. Interactive "Chess Level Assessment" (Lead Magnet)
Replace the traditional static form with a **3-Question Interactive Mini-Quiz**:
1. *What is your child's age?* `[5–7] [8–10] [11–14]`
2. *How familiar are they with chess?* `[Brand New] [Plays with Family] [Plays Online / Knows Rules]`
3. *What is your main goal?* `[Build Focus & Patience] [Learn a Healthy Hobby] [Win School Tournaments]`
* **The Conversion Hook:**  
  > *"Aarav qualifies for the Junior Tacticians Batch! Enter your WhatsApp number to view his tailored learning roadmap and claim his Free Demo Class."*
* **Conversion Impact:** Interactive quizzes typically lift landing page lead capture rates by **2.5x to 3x** compared to standard contact forms.

### 2. Floating Mobile WhatsApp Quick-Action
* 75%+ of Indian traffic visits on mobile. A persistent, non-intrusive floating WhatsApp bubble on the bottom right corner with:
  > *"Chat with an Academy Coordinator — Free Demo"*
* Automatically opens WhatsApp with the pre-filled text:  
  `"Hi Nexa Chess, I would like to book a free trial class for my child."`

### 3. Trust Proof Above the Fold
* FIDE badges and ratings of head coaches.
* Key stats banner: *"500+ Students Trained • Certified FIDE Coaches • 4.9/5 Parent Rating"*.
* Real video quote from a parent explaining how their child's attention span improved in school.

---

## 5. Demo "No-Show" Elimination & Sales Closing Engine

Across online academies, **40% to 50% of booked free demos fail to attend** because parents forget or get distracted. Closing the sale requires a tight pre-class and post-class sequence:

```
[ Demo Booked ]
       │
       ▼ (2 Hours Before)
[ Pre-Class "Hype Message" + 1-Move Puzzle on WhatsApp ]
       │
       ▼
[ Live Demo Class (30-45 mins on Nexa Board) ]
       │
       ▼ (15 Minutes After)
[ Instant Post-Demo Evaluation Card + Limited-Seat Offer ]
```

### 1. The 2-Hour Pre-Class "Hype Message"
Dispatched automatically using `demo_reminder`:
> *"Hi Priya, Coach Karthik is looking forward to meeting Aarav today at 5:00 PM! Here is a fun 1-move puzzle Aarav can think about before we start [Diagram]. See you both in 2 hours!"*  
* **Impact:** Drops demo no-show rates from ~50% down to under 20%.

### 2. The 15-Minute Post-Demo "Evaluation Report"
Immediately after the class finishes, the coach or system generates an **Evaluation Scorecard**:
* **Student:** Aarav (Age 8)
* **Tactical Vision:** 8/10
* **Focus & Patience:** Excellent
* **Recommended Batch:** Level 1 Foundation (Saturday & Sunday 5 PM)
* **Urgency CTA:** *"We keep batches small (max 6 students). Only 2 seats remain for this weekend's batch. [Click here to enroll & secure Aarav's seat]"*.

---

## 6. Organic Growth & Viral Referral Loops

Paid ads should be complemented by zero-cost referral mechanisms (`docs/REFERRALS.md`):

1. **"Bring a Sibling or Friend to the Demo" Hook:**
   * At the moment of demo booking, offer:
     > *"Chess is more exciting with friends! Would you like to invite Aarav's cousin or best friend to join this demo class for free?"*
   * Instantly doubles trial participation with zero additional ad cost.
2. **"Refer-a-Classmate" Tuition Credit:**
   * Enrolled parents receive a personal referral link. When a referred school classmate enrolls:
     * The existing family gets **₹500 tuition credit**.
     * The new family gets **₹500 off their first month**.
3. **Milestone Shareable Badges:**
   * When a student wins their first tournament or completes a 30-day streak in Solo Rush (`docs/PUZZLE_RUSH_SOLO.md`), generate an attractive graphic badge with a 1-tap *"Share to WhatsApp Status"* button.

---

## 7. Execution Checklist & Growth KPIs

### Immediate Actions (Next 48 Hours)
- [ ] Connect WhatsApp ad campaigns directly to the `demo_request_received_v2` slot selector.
- [ ] Add the floating WhatsApp mobile pill to `nexachess.in`.
- [ ] Implement the 2-hour pre-demo WhatsApp reminder schedule.

### Core Metrics to Track
| Metric | Healthy Benchmark | Action if Below |
| :--- | :---: | :--- |
| **Meta Ad Click-to-Lead Rate** | > 8% | Refine ad creative; test "Screen Time" video hook |
| **Speed to Initial WhatsApp Contact** | < 60 seconds | Verify webhook triggers in `apps/api/src/support/` |
| **Demo Attendance Rate** | > 65% | Check 2-hour pre-class reminder delivery |
| **Demo-to-Paid Conversion Rate** | > 25% | Send post-demo scorecard within 15 mins; call within 2 hours |
