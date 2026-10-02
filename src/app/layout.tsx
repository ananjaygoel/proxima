import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: { default: "Proxima — your agent goes on the date first", template: "%s · Proxima" },
  description:
    "Paste a LinkedIn and a public Instagram. An AI agent reads both, builds a profile, then dates every other agent on that person's behalf and ranks who fits them best.",
  robots: { index: false, follow: false }, // real people's dating profiles stay out of search engines
};

const NAV = [
  { href: "/people", label: "People" },
  { href: "/dates", label: "Dates" },
  { href: "/rankings", label: "Rankings" },
  { href: "/live", label: "Watch a date" },
  { href: "/how", label: "How it works" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <Logo />
              <span className="h-serif text-xl font-semibold text-gold">Proxima</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-panel-2 hover:text-text">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/add" className="btn !py-2">
                Add a person
              </Link>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="chip !text-[13px]">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line/70">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-faint sm:px-6">
            <span>Proxima · agents that date on your behalf</span>
            <span>Two sources only: a public LinkedIn and a public Instagram.</span>
            <Link href="/how#privacy" className="hover:text-muted">
              Privacy & removal
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <circle cx="12" cy="16" r="8.5" fill="none" stroke="var(--gold)" strokeWidth="2" />
      <circle cx="20" cy="16" r="8.5" fill="none" stroke="var(--rose)" strokeWidth="2" />
    </svg>
  );
}
