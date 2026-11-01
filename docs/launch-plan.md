# BitFlow launch plan: Indian colleges and students

A working document. Update the dates, numbers and checkboxes as you go.

**Model:** free for students, paid department plans for colleges, starting with a free one-semester pilot.
**Market:** India first. Engineering colleges with ECE, EEE and VLSI programmes.

The academic year shapes the timing. Odd-semester exams run in November and December. The even semester
starts in January, and digital design, HDL and VLSI labs often fall in it (4th and 6th semester). College
budgets follow the April to March financial year, so paid plans are decided in March and April.

---

## 1. Positioning

| Audience | Message |
|----------|---------|
| Students | Practise Verilog in your browser. No install, graded problems, and VLSI interview prep. |
| Faculty and HODs | Run your HDL lab on any laptop, with auto-graded assignments, marks export and copy checks. Free pilot for one semester. |
| Placement cells | Students arrive at core VLSI interviews having solved real RTL problems and timed mock interviews. |

Proof to collect during pilots: how many students solved each assignment, the hours of grading saved, and
quotes from faculty and students.

## 2. Who to approach, in order

1. **Tier-2 and tier-3 private and autonomous engineering colleges with ECE/EEE.** Their labs rarely have
   enough ModelSim or Vivado seats, and the HOD can say yes without a long process.
2. **Faculty you already know**, and alumni of your own college now teaching.
3. **Student clubs**: IEEE student branches and VLSI or electronics clubs, for workshops and contests.
4. **Later**: NITs and IIITs through faculty development programmes (FDPs) and AICTE and ATAL FDP listings.

Build a list of 100 colleges in a spreadsheet: college, city, university, HOD name and email, one or two
faculty who teach digital design or VLSI, source (website, LinkedIn), status.

## 3. Timeline

| When | What | Done when |
|------|------|-----------|
| Nov 2026 | Ship the Phase A product changes (section 7). Make the brochure, demo video and sample lab manual. Build the list of 100 colleges. | `/colleges` is live, the list has 100 rows |
| Late Nov – Dec 2026 | Outreach to faculty by email, LinkedIn and phone. Run 2–3 free online workshops ("Verilog in 90 minutes") during the exam break. | 5–10 pilots agreed for January |
| Jan 2027 | Public student launch with the even semester. Set up each pilot class personally, including the first assignment. Start the campus ambassador programme. | Every pilot has a class with an assignment |
| Feb – Mar 2027 | Inter-college Arena contest with certificates. Collect pilot data and testimonials. Pitch department plans to pilot colleges **before the April budget**. | A written proposal sent to each pilot |
| Apr – Jun 2027 | Close the first paid department plans for 2027–28. Summer push for students: internship and placement interview prep. | First paid invoices |
| Jul – Aug 2027 | The odd semester starts with paying colleges. Placement season (Aug–Dec) drives interview prep. | Paying departments running classes |

## 4. Pricing (a starting point to test in pilots)

- **Students:** free, including the AI tutor with its daily cap.
- **Department plan:** about ₹40,000–75,000 a year per department (up to about 240 students), or about
  ₹300–400 per student a year. It covers all the department's classes, the department dashboard, marks export,
  copy checks, a faculty workshop and priority support.
- **Free pilot:** one semester, one department. It converts to paid at the next budget.
- **Billing:** a GST invoice paid by bank transfer, or against a purchase order. Colleges rarely pay by card, so
  a payment gateway can wait. Register for GST when turnover nears ₹20 lakh, or earlier if colleges need a GSTIN
  on the invoice.

Ask every pilot college what they pay today for lab software and what budget line this would come from. Adjust
the price after the first five conversations.

## 5. Channels and assets

- [ ] `/colleges` page with the pilot form. Pilot requests show in Admin → Messages, marked "College pilot".
- [ ] One-page PDF brochure, made from the `/colleges` page.
- [ ] 3-minute demo video: create a class, join with a code, solve a problem, export marks.
- [ ] A sample lab manual mapped to one university syllabus (start with the one your first pilot uses: AKTU, VTU,
      JNTU or Anna University), listing which BitFlow problems cover each experiment.
- [ ] LinkedIn posts with short screen recordings, and a YouTube series of short lessons that link to Academy chapters.
- [ ] Workshops and FDPs.
- [ ] Campus ambassadors: 1–2 students per college, each with a tagged link such as `https://<site>/?ref=abc-college`.
      Sign-ups per tag show in Admin → Overview → "Sign-ups by source".
- [ ] Inter-college contest, using the existing Contests feature and certificates.

Use tags on every link you share, so the admin page shows what works: `?ref=<college or ambassador>` for people
and `?utm_source=linkedin`, `?utm_source=youtube`, `?utm_source=workshop-dec` for channels. A tag is 1–40
lower-case letters, digits, `-` or `_`. The first tag a visitor arrives with is kept for 30 days in their browser.

## 6. Metrics, every week

| Metric | Where |
|--------|-------|
| Sign-ups, and sign-ups by source | Admin → Overview |
| Weekly active students, runs and submits | Admin → Overview |
| Pilot requests | Admin → Messages |
| Active classes and assignments | Admin, or the database |
| Pilots agreed, pilots active, pilots converted to paid | Your college spreadsheet |

## 7. Product work

### Phase A: before outreach (done)

- **Sign-ups from one campus IP.** A lab behind one shared address could create only 5 accounts a minute. Now
  200 per 10 minutes per address, plus 5 a minute per username. The bot check is unchanged.
- **`/colleges` page and pilot form**, in the header menu and the sitemap.
- **Roll numbers and marks.** Students can add their roll number when they join a class, and teachers can correct
  it in the member list. The progress grid and CSV are sorted by roll number. A teacher can set "Marks out of N":
  the CSV then has a marks column, where every problem counts the same and a late solve earns half.
- **Sign-up source tracking** (`?ref=` and `utm_source`), shown in the admin overview. It isn't kept for under-18
  accounts.
- **Load test**: `npm run load-test -- <url> [students] [runs]` (see below).

### Phase B: during pilots (Dec 2026 – Feb 2027)

- **Institutions and department plans**: an institution record (plan, seat limit, valid until) linked to its
  classes, and a department dashboard that adds up their analytics. Enforce plans softly: a banner when a plan
  lapses, never locking students out.
- **Teacher onboarding**: a "Start a class" guide on `/classes`, and sample assignment packs per syllabus.
- **Copy check per assignment**: already part of class analytics (pairs of accepted designs that look copied);
  improve it with what pilot faculty ask for.

### Phase C: when demand shows

Razorpay for card and UPI, email delivery (password reset, assignment reminders), Google sign-in for college
Workspace domains, export to Moodle or Google Classroom, and Hindi and regional-language Academy content.

## 8. Capacity

Move production from SQLite to Postgres before the January launch (README, "Moving from SQLite to Postgres").
Set `MAX_CONCURRENT_SIMULATIONS` to the server's number of cores.

Run the load test against staging (never production) before each pilot starts, and record the result here:

```bash
npm run load-test -- https://staging.your.domain 60 3
```

It creates accounts named `loadtest_<time>_<n>`; delete them from Admin → Users afterwards.

| Date | Server | Students × runs | Sign-ups | Runs | p50 | p95 | Result |
|------|--------|-----------------|----------|------|-----|-----|--------|
| 2026-11-01 | Local, 4 cores, SQLite, `MAX_CONCURRENT_SIMULATIONS=4` | 60 × 3 | 60 ok | 180 ok in 2.5 s | 0.54 s | 0.81 s | Pass |
| 2026-11-01 | Local, 4 cores, SQLite, `MAX_CONCURRENT_SIMULATIONS=4` | 120 × 3 | 120 ok | 360 ok in 5.1 s | 1.01 s | 1.63 s | Pass |

These runs used a small AND-gate simulation. Real lab designs take longer, so leave headroom: aim for p95 under
about 5 s with the class's real problems.

## 9. Privacy (DPDP Act)

The privacy notice now mentions the optional roll number, the campaign tag and the pilot form's phone number.
These are small, optional additions, so `CONSENT_VERSION` was not bumped. Bump it (in `lib/privacy.ts`) if you
decide the change is material, and everyone will be asked to accept the notice again. Under-18 students still
need a parent's consent before joining a class.
