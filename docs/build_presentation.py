"""
Generates a polished PowerPoint: Part 1 = Virtual Cricket Auction (Play Store),
Part 2 = Momas High Society Art Auction (web demo).
Run: python docs/build_presentation.py
Output: docs/Virtual-Cricket-Auction-and-Momas-High-Society.pptx
"""
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt

# Brand: purple + lime green (aligned with web app)
C_PURPLE = RGBColor(58, 29, 94)
C_PURPLE_MID = RGBColor(92, 45, 145)
C_LIME = RGBColor(160, 225, 55)
C_MUTED = RGBColor(90, 84, 110)


def set_title_style(shape, size_pt=40, color=None):
    for p in shape.text_frame.paragraphs:
        p.font.size = Pt(size_pt)
        p.font.bold = True
        if color:
            p.font.color.rgb = color


def set_subtitle_style(shape, size_pt=20):
    for p in shape.text_frame.paragraphs:
        p.font.size = Pt(size_pt)


def add_bullet_slide(prs, title_text, bullets, subtitle_line=None):
    layout = prs.slide_layouts[1]  # Title and Content
    slide = prs.slides.add_slide(layout)
    slide.shapes.title.text = title_text
    set_title_style(slide.shapes.title, 32, C_PURPLE)

    body = slide.shapes.placeholders[1]
    tf = body.text_frame
    tf.clear()
    tf.word_wrap = True
    for i, (text, level) in enumerate(bullets):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = text
        p.level = level
        p.font.size = Pt(18 if level == 0 else 16)
        p.space_after = Pt(6)
    if subtitle_line:
        # footer note as extra paragraph
        p = tf.add_paragraph()
        p.text = subtitle_line
        p.level = 0
        p.font.size = Pt(12)
        p.font.italic = True
        p.font.color.rgb = C_MUTED


def add_section_divider(prs, number, label, accent_line):
    """Visual section break."""
    layout = prs.slide_layouts[5]  # Blank
    slide = prs.slides.add_slide(layout)
    left = Inches(0.8)
    top = Inches(2.5)
    width = Inches(8.5)
    height = Inches(2)
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.text = f"Part {number}"
    p.font.size = Pt(24)
    p.font.color.rgb = C_LIME
    p.alignment = PP_ALIGN.LEFT
    p = tf.add_paragraph()
    p.text = label
    p.font.size = Pt(44)
    p.font.bold = True
    p.font.color.rgb = C_PURPLE
    p = tf.add_paragraph()
    p.text = accent_line
    p.font.size = Pt(20)
    p.font.color.rgb = C_PURPLE_MID


def add_title_slide(prs):
    layout = prs.slide_layouts[0]
    slide = prs.slides.add_slide(layout)
    title = slide.shapes.title
    subtitle = slide.placeholders[1]
    title.text = "Virtual Auctions in Practice"
    subtitle.text = (
        "From live cricket player drafts to high-society art salerooms\n\n"
        "Virtual Cricket Auction (Google Play)  •  Momas High Society Art Auction (Web)"
    )
    set_title_style(title, 44, C_PURPLE)
    set_subtitle_style(subtitle, 20)


def add_agenda(prs):
    add_bullet_slide(
        prs,
        "What we’ll cover",
        [
            ("Session roadmap — two products, one narrative about digital auctions", 0),
            ("Part 1 — Virtual Cricket Auction (mobile, mass-market, real-time play)", 1),
            ("   Product story, features, scale, and learning resources", 2),
            ("Part 2 — Momas High Society Art Auction (web platform)", 1),
            ("   Roles, architecture, tech stack, and buyer artist workflows", 2),
            ("Synthesis — how each product serves its audience; takeaways", 1),
        ],
    )


def main():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    add_title_slide(prs)
    add_agenda(prs)

    add_bullet_slide(
        prs,
        "Part 1 — Virtual Cricket Auction",
        [
            ("Consumer Android app on Google Play — sports & social gaming focus", 0),
            ("Lets groups run live, competitive auctions to build fantasy / custom teams by bidding on cricket players", 1),
            ("Developed by Saurabh Khire; strong traction signal with 100,000+ downloads", 1),
            ("Monetization: contains ads; broad “Everyone” content rating", 1),
            ("Positioning: friend-room multiplayer + optional solo play — low friction entry to auction mechanics", 1),
        ],
        "Source: Google Play listing — Virtual Cricket Auction",
    )

    add_bullet_slide(
        prs,
        "Virtual Cricket Auction — Feature depth",
        [
            ("Live automatic bidding alongside friends — shared room energy, clock-driven tension", 0),
            ("Manual bidding mode with a designated Manager — human auctioneer control", 0),
            ("Curated roster of players — themed content for cricket fans", 0),
            ("Polished, user-friendly UI — onboarding friction kept low for casual groups", 0),
            ("Auto-save sessions — resume interrupted auctions without losing state", 0),
            ("Configurable auction rules — adapt timing, flow, or house style", 0),
            ("Single-player auctions with bots — practice or solo entertainment", 0),
            ("Community posts — advertise upcoming rooms so members plan ahead", 0),
        ],
    )

    add_bullet_slide(
        prs,
        "Virtual Cricket Auction — Tutorials & discovery",
        [
            ("Structured video walkthroughs are published for every major workflow", 0),
            ("Part 1 — Login & Register", 1),
            ("Part 2 — Rooms (creating / joining spaces)", 1),
            ("Part 3 — Automatic auction experience", 1),
            ("Part 4 — Manual auction with a manager", 1),
            ("Store link for install and updates:", 0),
            (
                "https://play.google.com/store/apps/details?id=com.auction.virtualauctionclient",
                1,
            ),
        ],
        "Reduces support load; excellent model for any auction product’s GTM.",
    )

    add_bullet_slide(
        prs,
        "Why this app matters — product lessons",
        [
            ("Proves auction UX at scale: latency, fairness, and clarity under social pressure", 0),
            ("Dual modes (auto vs manual) serve both casual parties and structured league nights", 0),
            ("Persistence + bots widen the funnel — install → solo try → invite friends", 0),
            ("Sports context makes abstract “bidding” instantly relatable worldwide", 0),
        ],
    )

    add_section_divider(
        prs,
        "2",
        "Momas High Society",
        "Art Auction — web platform for curated salerooms",
    )

    add_bullet_slide(
        prs,
        "Part 2 — Momas High Society Art Auction (Demo)",
        [
            ("Full-stack web application for high-society art sales and curated timed auctions", 0),
            ("Objective: credible preview of remote salerooms with real calendar boundaries", 1),
            ("B2B-leaning operations with a polished buyer-facing auction room", 1),
            ("Brand: purple & lime identity — serif headlines, modern gallery feel", 1),
        ],
    )

    add_bullet_slide(
        prs,
        "Momas — Technology stack",
        [
            ("Frontend: React 18 + Vite + React Router — fast dev, production-grade bundle", 0),
            ("Backend: Node.js + Express (REST) — predictable integration for future mobile or ERP clients", 0),
            ("Data: SQLite (local file) — zero-ops for pilot demos; path to Postgres later", 0),
            ("Security baseline: JWT sessions, bcrypt passwords, role-gated routes", 0),
            ("Assets: Multer file uploads — artwork photography stored server-side", 0),
            ("Ops: single-command dev orchestration; documented DB reset for clean demos", 0),
        ],
    )

    add_bullet_slide(
        prs,
        "Architecture — logical view",
        [
            ("Browser SPA talks to REST API (Vite proxy in development)", 0),
            ("Every API pass refreshes auction state from wall-clock time", 1),
            ("Lifecycle: scheduled → live → ended → finalized (writes sales ledger)", 1),
            ("Finalization is transactional: highest bid per lot, debit buyer, credit artist (virtual)", 1),
            ("Separates presentation, orchestration, and persistence — easy to extend (e.g. Stripe webhooks)", 1),
        ],
    )

    add_bullet_slide(
        prs,
        "Roles & responsibilities",
        [
            ("Artist — portfolio up to 10 pieces; image + story; inventory states: available / in auction / sold", 0),
            ("Admin (Curator) — ingest consignment, compose auction sessions, set opening bids, wall times", 0),
            ("Buyer — virtual balance at signup; pre-register with session budget cap; bid only while live", 0),
            ("Enforcement: bid increments, budget cap vs outstanding winning bids, optional legacy per-lot ceiling", 0),
        ],
    )

    add_bullet_slide(
        prs,
        "Buyer journey (highlight reel)",
        [
            ("Discover auctions from Saleroom, auction list, or deep link to a room", 0),
            ("Pre-register before start_time — explicitly budget-bound commitment", 0),
            ("Live room polls prices; raise, quick-bid, or custom amount with validation", 0),
            ("Settlement runs automatically after end_time — purchases grouped by auction in “My purchases”", 0),
            ("Placeholder path for future card billing — Stripe checkbox captured at registration today", 0),
        ],
    )

    add_bullet_slide(
        prs,
        "Side-by-side — two products, two intents",
        [
            ("Audience: Cricket app = broad consumer / sports clubs; Art demo = gallery staff + collectors", 0),
            ("Surface: Native Android vs responsive web (deployable as PWA or packaged later)", 0),
            ("Content: Player cards & fantasy framing vs consigned artworks & provenance narrative", 0),
            ("Trust: Play Store social proof + tutorials vs JWT-secured B2C-lite saleroom controls", 0),
            ("Shared DNA: time-boxed competition, clear hammer logic, explainable bid rules", 0),
        ],
    )

    add_bullet_slide(
        prs,
        "Virtual Cricket Auction — Reach & trust signals",
        [
            ("Category placement: Sports — aligns with seasonality, leagues, and fan events", 0),
            ("Store visibility: installs and ratings build organic discovery for new hosts", 0),
            ("Developer-declared data practices (per Play Console): plan communications accordingly", 1),
            ("Support channel listed on store — reduces friction for schools, clubs, and creators", 0),
            ("Ideal references when pitching “auction as a format” to non-technical stakeholders", 0),
        ],
        "Listing: play.google.com/store/apps/details?id=com.auction.virtualauctionclient",
    )

    add_bullet_slide(
        prs,
        "Momas — Persistent data (why auditors care)",
        [
            ("users — identity, role, virtual_balance, optional Stripe-interest flags", 0),
            ("arts — consigned objects with status / availability machine", 0),
            ("auctions + auction_arts — session contract: times, lots, opening bids, cap rules", 0),
            ("auction_registrations — buyer commitment envelope before gavel", 0),
            ("bids — append-only evidence trail for dispute review", 0),
            ("art_sales — immutable settlement once hammer is formalized in software", 0),
        ],
        "SQLite today → portable SQL for gallery IT review tomorrow.",
    )

    add_bullet_slide(
        prs,
        "Roadmap ideas (both lanes)",
        [
            ("Cricket: deeper analytics for hosts, premium ad-free tier, cross-promotion APIs", 0),
            ("Gallery demo: PSP integration, KYC for hammer price, condition reports PDF", 0),
            ("Shared: fairness monitors, anti-sniping policy toggles, replay exports for transparency", 0),
            ("Shared: optional WebSocket layers on top of proven REST semantics", 0),
        ],
    )

    add_bullet_slide(
        prs,
        "Strategic takeaway",
        [
            ("Virtual Cricket Auction shows how auction mechanics scale socially on mobile with excellent onboarding", 0),
            ("Momas High Society Art Auction shows how the same clarity maps to high-trust cultural commerce on the web", 0),
            ("Together they illustrate a spectrum: viral leisure rooms → curated institutional sales", 0),
            ("Next investments for the web demo: WebSockets, payment capture, multi-tenant galleries, mobile wrapper", 0),
        ],
    )

    # Closing
    layout = prs.slide_layouts[0]
    slide = prs.slides.add_slide(layout)
    slide.shapes.title.text = "Thank you"
    slide.placeholders[1].text = (
        "Questions?\n\nVirtual Cricket Auction on Google Play\n"
        "Momas High Society Art Auction — React • Node • SQLite demo"
    )
    set_title_style(slide.shapes.title, 44, C_PURPLE)

    out = Path(__file__).resolve().parent / "Virtual-Cricket-Auction-and-Momas-High-Society.pptx"
    prs.save(str(out))
    print(f"Saved: {out}")


if __name__ == "__main__":
    main()
