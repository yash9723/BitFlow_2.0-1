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

### Phase B: for the pilots (done)

- **Institutions (departments) and plans.** In Admin → Colleges you create a department with its plan (free pilot
  or department plan), seat limit and last day, then add its heads and teachers by username. A teacher's existing
  classes move into the department, and classes they create later belong to it. You can also attach or detach a
  class by its join code.
- **Department dashboard** at `/institution/<address>` for the department's heads (and site admins): classes,
  students against seats, students active this week, how much assigned work is solved, and one row per class, with
  a CSV export. Heads see class totals only, never student names. Heads find it from their Classes page.
- **Soft enforcement.** When a plan has 30 days or fewer left, has ended, or has more students than seats, its
  teachers and heads see a banner with a contact link. Nothing is ever blocked for students or teachers.
- **Lab packs.** On a class page, "Add a lab pack" creates one assignment per experiment, a week apart: Digital
  electronics lab (10 experiments), Verilog HDL lab (8) and VLSI design lab (6), built from experiments most
  university labs share. Teachers can delete or edit any of them.
- **"Start a class" guide** on `/classes`, open for anyone who has no classes yet.
- **Copy check** per assignment was already part of class analytics. Improve it with what pilot faculty ask for.

### Setting up a pilot college (step by step)

1. The pilot request arrives in Admin → Messages ("College pilot"). Reply by email and book a call.
2. Ask the HOD and each teacher to create a BitFlow account and send you their usernames.
3. In Admin → Colleges, create the department: name like "Example Institute of Technology — ECE", an address
   like `eit-ece`, plan "Free pilot", the seat count you agreed, and the semester's last day.
4. Add the HOD as **Head** and each faculty member as **Teacher**.
5. On the call, have each teacher create their class and add a lab pack, then share the join code with students.
   Students add their roll numbers when they join.
6. During the semester, check the department dashboard with the HOD. Near the end, send the dashboard's CSV with
   your proposal for a department plan.
7. When they pay, change the plan to "Department plan", set the new seats and last day, and put the PO or invoice
   number in Notes.

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
| 2026-11-01 | Same, after Phase B | 60 × 3 | 60 ok | 180 ok in 2.8 s | 0.59 s | 0.91 s | Pass |

These runs used a small AND-gate simulation. Real lab designs take longer, so leave headroom: aim for p95 under
about 5 s with the class's real problems.

## 9. Privacy (DPDP Act)

The privacy notice now mentions the optional roll number, the campaign tag, the pilot form's phone number, and
that a department's heads see class totals (never names). The personal-data download includes the roll number,
the campaign tag and department membership.
These are small, optional additions, so `CONSENT_VERSION` was not bumped. Bump it (in `lib/privacy.ts`) if you
decide the change is material, and everyone will be asked to accept the notice again. Under-18 students still
need a parent's consent before joining a class.
