import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { HOW_JUNU_WORKS } from "@/components/howJunuWorks";
import { IconCheck, IconFile, IconInbox, IconSend, IconSparkles, IconStar, Logo } from "@/components/icons";

// Public landing page. Signed-in users never see it: the middleware sends them to /home.

const SIGN_UP = "/login?mode=signup";

const FEATURES = [
  {
    icon: IconSparkles,
    title: "Truthful tailoring",
    body: "Every edit is checked against your resume and approved facts. Skills or numbers you can't back up are reverted automatically.",
  },
  {
    icon: IconFile,
    title: "Your template, kept",
    body: "Upload LaTeX, PDF or Word. Jobify edits the content and keeps your layout, then compiles a clean PDF.",
  },
  {
    icon: IconStar,
    title: "Top matches, ranked",
    body: "Fresh postings from company career sites, scored against your resume so the best fits rise to the top.",
  },
  {
    icon: IconSend,
    title: "Applications, prepared",
    body: "Junu fills in the employer's actual application questions from your profile and resume, for you to review.",
  },
  {
    icon: IconInbox,
    title: "Updates from Gmail",
    body: "Connect Gmail read-only and interview invites, assessments and rejections show up as updates you can act on.",
  },
  {
    icon: IconCheck,
    title: "A chat that does the work",
    body: "Ask Junu to find jobs, tailor for your best match, or prepare an application, and she takes it from there.",
  },
];

const PROMISES = [
  { title: "Never invents experience", body: "Tailoring uses only what's in your resume and the facts you approve." },
  { title: "You approve everything", body: "Junu prepares; you review every resume and application before it's used." },
  { title: "Read-only email access", body: "Gmail access can't send or delete mail. Tokens are encrypted, and you can disconnect any time." },
  { title: "Your data stays yours", body: "Everything is private to your account. Voluntary self-ID is opt-in and never sent to AI." },
];

const FAQ = [
  {
    q: "Does Jobify submit applications for me?",
    a: "Only if you want it to. By default Junu finds jobs, tailors your resume and fills in the application, and you submit it. Turn on automatic submitting and the Jobify Chrome extension applies for you in your own browser, within your daily limit, and hands back anything it can't finish truthfully.",
  },
  {
    q: "Will Junu add skills I don't have?",
    a: "No. Tailoring can only reword and reorder what's already in your resume and the facts you approve. Anything it can't back up is reverted, and you can see every change side by side.",
  },
  {
    q: "Where do the jobs come from?",
    a: "Companies' own career sites (through their Greenhouse, Lever and Ashby job boards) and remote job boards. You can also paste a link or the posting text yourself.",
  },
  {
    q: "Can I start using it right away?",
    a: "Jobify is in early access. Create an account and it'll be approved shortly; you'll be able to sign in as soon as it is.",
  },
  {
    q: "What happens to my email?",
    a: "Connecting Gmail is optional and read-only. Jobify only looks at job-related mail and keeps a one-line summary of each update, never the email itself.",
  },
];

export default function Landing() {
  return (
    <div id="top" className="bg-white text-slate-900">
      <TopBar />
      <Hero />
      <HowItWorks />
      <Features />
      <Promises />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

// ------------------------------------------------------------------ sections

function TopBar() {
  return (
    <header className="sticky top-0 z-40 bg-brand-50/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-lg font-semibold tracking-tight">Jobify</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#how-it-works" className="hover:text-slate-900">How it works</a>
          <a href="#features" className="hover:text-slate-900">Features</a>
          <a href="#trust" className="hover:text-slate-900">Privacy</a>
          <a href="#faq" className="hover:text-slate-900">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Sign in</Link>
          <Link href={SIGN_UP} className="hidden rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:inline-flex">Get started</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50 via-[#f8f5ff] to-white" aria-hidden />
      <div className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-brand-200/40 blur-3xl" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100">
            <span className="size-1.5 rounded-full bg-brand-500" /> Meet Junu, your job search assistant
          </span>
          <h1 className="mt-5 text-[40px] font-bold leading-[1.05] tracking-tight sm:text-6xl">
            A truthful resume for <span className="text-brand-600">every job</span> you apply to.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Junu finds fresh openings, tailors your resume to each one without inventing anything, and gets the
            application ready. You review, approve and apply.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={SIGN_UP} className="inline-flex h-12 items-center justify-center rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700">
              Get started free
            </Link>
            <a href="#how-it-works" className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[15px] font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:ring-slate-300">
              See how it works
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-500">Early access · New accounts are approved before first sign-in.</p>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

/** Junu with a few cards from the app, as an illustration of what it does. */
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="relative mx-auto aspect-square w-[72%] sm:w-[70%]">
        <div className="absolute inset-[8%] rounded-full bg-gradient-to-br from-brand-200 to-brand-100" aria-hidden />
        <Image src="/junu.png" alt="Junu, Jobify's assistant" fill priority sizes="(min-width: 1024px) 420px, 70vw" className="object-contain drop-shadow-2xl" />
      </div>

      <FloatCard className="sm:-left-4 sm:top-[6%]">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-900"><IconStar className="size-4 fill-slate-900" /></span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top match</div>
            <div className="text-sm font-semibold">Backend Engineer · Acme</div>
          </div>
          <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">87%</span>
        </div>
      </FloatCard>

      <FloatCard className="sm:-right-4 sm:top-[44%]">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resume tailored</div>
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span className="text-slate-400 line-through">62%</span>
          <span className="text-slate-400">→</span>
          <span className="font-bold text-emerald-700">87% match</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600"><IconCheck className="size-3.5 text-slate-900" strokeWidth={2.5} /> Every change backed by your resume</div>
      </FloatCard>

      <FloatCard className="sm:bottom-[2%] sm:left-[6%]">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-lg">🎉</span>
          <div>
            <div className="text-sm font-semibold">Interview request · Acme</div>
            <div className="text-xs text-slate-500">Found in Gmail · just now</div>
          </div>
        </div>
      </FloatCard>
    </div>
  );
}

function FloatCard({ className, children }: { className: string; children: ReactNode }) {
  return (
    // Phones: stacked under the picture. Larger screens: floating around Junu.
    <div className={`relative mt-3 rounded-2xl bg-white/95 px-4 py-3 shadow-[0_12px_40px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/70 backdrop-blur sm:absolute sm:mt-0 ${className}`}>
      {children}
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading eyebrow="How it works" title="From resume to interview, in five steps" body="Junu does the busywork. You make the decisions." />
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {HOW_JUNU_WORKS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={s.title} className="relative rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200/70">
                {i < HOW_JUNU_WORKS.length - 1 && (
                  <span className="absolute -right-3 top-12 z-10 hidden h-0.5 w-6 bg-brand-200 lg:block" aria-hidden />
                )}
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
                    <Icon className="size-5" strokeWidth={2.1} />
                  </span>
                  <span className="text-3xl font-bold text-brand-200">{i + 1}</span>
                </div>
                <h3 className="mt-5 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 bg-slate-50/70 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading eyebrow="Features" title="Everything a focused job search needs" body="One place to find roles, tailor your resume, prepare applications and follow up." />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-3xl bg-white p-7 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5">
                <span className="grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-900">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Promises() {
  return (
    <section id="trust" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <SectionHeading align="left" eyebrow="Truthful & private by design" title="Built so you can trust what goes out in your name" />
          <div className="mt-8 flex items-center gap-4 rounded-3xl bg-brand-50/70 p-5 ring-1 ring-brand-100">
            <Image src="/junu-face.png" alt="" width={56} height={56} className="size-14 shrink-0 rounded-full ring-2 ring-white" />
            <p className="text-[15px] leading-relaxed text-slate-700">
              &ldquo;If your resume doesn&apos;t show it, I won&apos;t claim it. I&apos;ll tell you what&apos;s missing instead.&rdquo;
              <span className="mt-1 block text-sm font-semibold text-slate-900">Junu</span>
            </p>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {PROMISES.map((p) => (
            <li key={p.title} className="rounded-3xl border border-slate-200 p-6">
              <span className="grid size-8 place-items-center rounded-full bg-slate-900 text-white"><IconCheck className="size-4" strokeWidth={2.5} /></span>
              <h3 className="mt-4 font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-slate-50/70 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-12 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl bg-white px-6 py-5 ring-1 ring-slate-200/70 open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 py-20 sm:px-8 sm:py-24">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[36px] bg-slate-900 px-6 py-14 text-center text-white sm:px-12">
        <div className="pointer-events-none absolute -left-20 -top-24 size-80 rounded-full bg-brand-600/40 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -right-16 size-80 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
        <Image src="/junu-face.png" alt="" width={72} height={72} className="relative mx-auto size-[72px] rounded-full ring-4 ring-white/15" />
        <h2 className="relative mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Let Junu handle the busywork.</h2>
        <p className="relative mx-auto mt-3 max-w-xl text-lg text-white/75">Spend your time on the interviews, not on rewriting the same resume for the tenth time.</p>
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={SIGN_UP} className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-[15px] font-semibold text-slate-900 transition hover:bg-brand-50">
            Get started free
          </Link>
          <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/10">
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Features", href: "#features" },
      { label: "Privacy", href: "#trust" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Create account", href: SIGN_UP },
      { label: "Sign in", href: "/login" },
    ],
  },
];

function Footer() {
  return (
    <footer className="relative overflow-hidden bg-gradient-to-b from-white via-brand-50/60 to-brand-50">
      <div className="pointer-events-none absolute -bottom-40 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-brand-200/30 blur-3xl" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5 pt-16 sm:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.4fr_1fr_1fr] lg:gap-12">
          <div className="col-span-2 max-w-sm lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo size={34} />
              <span className="text-xl font-semibold tracking-tight">Jobify</span>
            </Link>
            <p className="mt-4 leading-relaxed text-slate-600">
              A truthful, tailored resume for every job you apply to, with Junu doing the busywork.
            </p>
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/80 p-3 pr-4 shadow-sm ring-1 ring-brand-100 backdrop-blur">
              <Image src="/junu-face.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-full ring-2 ring-white" />
              <p className="text-sm leading-snug text-slate-700">
                <span className="font-semibold text-slate-900">Hi, I&apos;m Junu.</span> Ready when you are.
              </p>
              <Link href={SIGN_UP} className="ml-auto shrink-0 rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                Get started
              </Link>
            </div>
          </div>

          {FOOTER_LINKS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-900">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="group inline-flex items-center gap-1.5 text-[15px] text-slate-600 transition hover:text-slate-900">
                      <span className="h-px w-0 bg-slate-900 transition-all group-hover:w-3" aria-hidden />
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Oversized wordmark */}
        <p
          className="pointer-events-none mt-14 select-none bg-gradient-to-b from-brand-300/70 to-brand-100/0 bg-clip-text text-center text-[22vw] font-bold leading-[0.8] tracking-tighter text-transparent lg:text-[13rem]"
          aria-hidden
        >
          Jobify
        </p>

        <div className="relative -mt-2 flex flex-col items-center justify-between gap-3 border-t border-brand-200/60 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} Jobify · Truthful by design</span>
          <a href="#top" className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900">
            Back to top <span aria-hidden>↑</span>
          </a>
        </div>
      </div>
    </footer>
  );
}

function SectionHeading({ eyebrow, title, body, align = "center" }: { eyebrow: string; title: string; body?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-lg leading-relaxed text-slate-600">{body}</p>}
    </div>
  );
}
