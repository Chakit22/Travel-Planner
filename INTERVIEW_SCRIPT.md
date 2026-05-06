# LK Group — AI Engineer Interview Script

**Format:** 30 min call
**Interviewer:** Non-technical (retail / ops / loyalty background)
**Headline:** *Atlas plans a 10-day trip in ~2 minutes — work that takes a person 2–3 hours of tab-juggling. And it remembers you next time.*

---

## The one analogy that runs through everything

> "ChatGPT with connectors is a smart intern who forgets you the moment you leave. Atlas is the concierge at a hotel you've stayed at five times — they already know you like a quiet room, seafood for dinner, and an early start. That memory is the moat."

Use this in the intro. Use it again in Q&A. It is the line he will repeat to his GM after the call.

---

## Time Budget

| Block | Minutes | Cumulative |
|---|---|---|
| 1. Intro + the concierge frame | 3 | 0:00 → 3:00 |
| 2. The picture (architecture, plain English) | 5 | 3:00 → 8:00 |
| 3. Live demo — the three "wow" moments | 12 | 8:00 → 20:00 |
| 4. What this means for LK Group | 5 | 20:00 → 25:00 |
| 5. Q&A | 5 | 25:00 → 30:00 |

**Cardinal rule:** if you fall behind, cut from block 4. Never cut the demo.

---

## Block 1 — Intro + the concierge frame (3 min)

**Goal:** Land the headline. Make him feel the problem.

> "Hi — I'm Chakit. I want to start with a question. Last time you planned a holiday, how many tabs did you have open? Skyscanner, Booking, TripAdvisor, Maps, maybe a spreadsheet?
>
> That's the problem I built Atlas for. It's an AI travel planner I built on top of Anthropic's Claude. It plans a full 10-day trip in about 2 minutes — what would normally take someone 2 to 3 hours.
>
> But the part I'm most proud of isn't the speed. It's the memory.
>
> ChatGPT with connectors is like a smart intern who forgets you the moment you leave. Atlas is more like the concierge at a hotel you've stayed at five times — they already know you like a quiet room, seafood for dinner, and an early start. **That memory is the moat.**
>
> Plan for the call: 5 minutes on the picture, ~12 minutes seeing it work, then what it means for LK Group, then your questions. Sound good?"

---

## Block 2 — The picture, plain English (5 min)

**Goal:** Show you can explain a system without jargon. He should be able to repeat it back.

Open the architecture diagram. Walk through it like a shop floor.

1. **(60s) The customer-facing bit.** "This is what the user sees — chat on one side, the trip plan building on the other. Like watching a barista make your coffee instead of just handing it to you."

2. **(60s) The brain.** "Behind the chat sits Claude — Anthropic's model. But Claude on its own is just a clever talker. The trick is giving it tools, the same way you'd give a new staff member access to the till, the stock system, and the roster app."

3. **(90s) The tools.** "Atlas has eight tools. Three are the big ones — flights, hotels, and a live nearby-places tool that uses GPS. So when the user says 'find me a hotel in Vietnam,' Claude doesn't make one up. It calls the real flight and hotel data, the same way you'd call a supplier."

4. **(90s) The memory.** "Every conversation, every preference, every past trip is saved. When you come back, Atlas already knows you. It's the difference between a brand new checkout person and one who's served you for two years."

**Closing line:** *"Two things make Atlas different from ChatGPT — it remembers you across trips, and when you actually land somewhere, it walks beside you. I'll show you both."*

---

## Block 3 — Live demo (12 min) — **THE BLOCK THAT MUST LAND**

**Pre-flight checklist (do BEFORE the call):**
- [ ] Dev server running, browser at `localhost:3000`
- [ ] Logged in as `chakit-demo@atlas.dev`
- [ ] Sydney trip (May 3–8) visible in the sidebar
- [ ] Browser location override set to Sydney
- [ ] One past trip already in the list (Bali, Tokyo, Bangkok all seeded)
- [ ] Phone on silent, second screen ready

### Demo beat sheet

#### Beat 1 — The concierge moment (3 min)
1. Click "+ New trip"
2. Type: *"I want to go somewhere warm in July"*
3. **Pause. Read his response out loud:**
   > "See how it suggested Vietnam, with seafood, boutique hotels, slow walking days? I never told it any of that — not in this conversation. It pulled that from the last three trips I've taken. **This is the concierge bit.** A normal chatbot would have asked me 'what kind of food do you like?' Atlas already knew."

#### Beat 2 — Watching it work (4 min)
1. Continue: *"Let's do Vietnam, 10 days from July 12, 2 of us, $4000 budget"*
2. **Point at the inline status as it runs:** "Searching for flights… searching for hotels… looking up local places…"
3. > "This is what I love about it. The user sees it *work*. Same reason an open kitchen builds more trust than a closed one — you watch the chef, you trust the meal. Most AI products hide this. Atlas shows it."
4. Wait for the day-by-day plan to render.
5. > "Day 1 to 10. Real flight numbers. Real hotel names. Real prices. Roughly 90 seconds. The first version of this product, with one human doing it, would take an afternoon."

#### Beat 3 — The companion moment (4 min)
1. Click the Sydney trip in the sidebar.
2. **Point at the banner:** *"You're in Sydney right now. Atlas is here with you."*
   > "This switched on by itself. The trip dates cover today, my browser location says Sydney, so the product changed mode. No button. **It just knew.** Like a hotel concierge who recognises you walking back through the lobby."
3. Type: *"I'm hungry, what's open near me right now?"*
4. **Read the response:**
   > "Three places, all currently open, with closing times. This is GPS plus live opening-hours data. The user asked one sentence and got a real answer they can act on in the next 10 minutes. That's the part competitors don't have."

#### Beat 4 — The loop closes (1 min)
1. After Atlas suggests something, say: *"Save that — I love Vietnamese food"*
2. Click into a fresh new trip.
3. Type: *"recommend dinner"*
4. > "Vietnamese options. The preference I just saved is already shaping the next conversation. **That's the memory loop. Every interaction makes the next one better.** Like a loyalty card that actually changes the experience instead of just giving you points."

---

## Block 4 — What this means for LK Group (5 min)

**Goal:** Make him picture you doing this for *his* business, not yours.

> "Atlas is a travel product, but the pattern is what matters for LK Group.
>
> Every brand under LK has a support team that answers the same questions over and over. Every brand has customers whose preferences would be obvious if anyone wrote them down.
>
> The same three pieces I built into Atlas — **a Claude agent, a set of tools, a memory layer** — is the exact recipe for:
>
> - **Support agent** that answers customer questions using your real product data, not a generic FAQ.
> - **Operations agent** that watches your stock, your bookings, your inbox, and flags what needs a human.
> - **Brand-voice agent** that drafts emails, social posts, product descriptions in the voice of each brand — because it remembers each brand's voice the way Atlas remembers a traveller's taste.
>
> The PD says the role exists to save your teams measurable hours per week. Every one of those agents replaces a repetitive task. **Atlas was my proof I can build the engine. The next ones are just different tools and a different memory.**"

---

## Block 5 — Q&A (5 min)

**The two questions you must have crisp answers for:**

**Q: "Why this over ChatGPT with connectors?"**
> "Three reasons. **One — memory.** ChatGPT doesn't remember a customer across sessions. Atlas does. **Two — tools you control.** I picked the flight API, the hotel API, the GPS source. ChatGPT connectors are off-the-shelf. **Three — it's a product, not a chat window.** Atlas has a UI built around the customer journey. ChatGPT is a box."
>
> *Bridge to LK:* "For a support team, that's the difference between an agent that knows your returns policy and one that's guessing from public web pages."

**Q: "Do you have users?"**
> "Honest answer — Atlas is a portfolio piece, not a launched product. I built it to prove I can ship. Two real users: me, and a friend who tested the Sydney companion mode last weekend. The ROI claim — 2 minutes vs 2 hours — is from timing my own planning before and after.
>
> What I'd bring to LK isn't a customer base. It's the muscle to take a brief on Monday and have an agent live by Friday. That's what the PD asks for."

**Other likely questions + short answers:**

| Question | Answer |
|---|---|
| How long did it take to build? | "About three weeks of evenings and weekends. From zero to the demo you just saw." |
| What was the hardest part? | "Memory. Making the agent remember preferences across separate trips without confusing them. Took three rewrites." |
| What would you do differently? | "Start with one tool, not eight. I built too much before testing if anyone wanted the simpler version." |
| What if Claude makes a mistake? | "Two safety nets — every tool has a strict format the model has to match, and the user can always reject and edit. We don't auto-book anything." |
| How would you measure success at LK? | "Hours saved per week per team. Same number the PD lists. I'd put a counter on every agent and report it weekly." |
| Do you know n8n / Zapier? | "Yes — used [your real example]. For Atlas I went bespoke because the trip flow needed proper state. n8n is the right tool for connecting *between* systems; bespoke is for the brain in the middle." |
| What's next for Atlas? | "Booking integration — actually buying the flight from the chat. Right now it stops at 'here's what I'd book.'" |

**End line if there's time:**
> "If I joined, the first week I'd shadow whichever support team you point me at, find the most-asked question, and have an agent answering it by Friday. That's the same playbook as Atlas — ship the smallest working thing, then layer. The PD says you want a builder. That's what I'd do on day one."

---

## Recovery moves

- **Demo breaks live:** Stay calm. *"Good — you're seeing the real thing, not a polished video. Give me 30 seconds."* Open the logs, narrate what you see. **A live debug is a green flag for an engineering hire.**
- **He cuts you off mid-block:** Ask *"Would you like the technical bit or skip to the part that matters for LK?"* — let him steer.
- **Asked something you don't know:** *"Honest answer — don't know. Here's how I'd find out."* Never bluff. Retail leaders smell bluffing instantly.
- **He's quiet / hard to read:** Pause and ask *"Is this the level of detail you want, or should I go higher?"* — gives him a way to redirect without it feeling like you're failing.

---

## Pre-call checklist (1 hour before)

- [ ] Restart dev server, reseed demo user
- [ ] Run the full demo end-to-end once
- [ ] Close all unrelated tabs and apps
- [ ] Architecture diagram in a separate tab, ready
- [ ] This script on a second screen or printed
- [ ] Phone silent, water nearby
- [ ] Reread the concierge analogy — it should feel natural, not memorised
