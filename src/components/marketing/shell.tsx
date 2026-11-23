import Link from "next/link";
import { NotebookTabs } from "lucide-react";
import { recordsDisclaimer, siteName } from "@/lib/marketing/site";

function Brand() {
  return (
    <Link href="/" className="marketing-brand">
      <span className="marketing-brand-mark">
        <NotebookTabs size={19} aria-hidden="true" />
      </span>
      {siteName}
    </Link>
  );
}

export function MarketingHeader() {
  return (
    <>
      <a className="marketing-skip" href="#main-content">
        Skip to main content
      </a>
      <header className="marketing-header">
        <div className="marketing-wrap marketing-header-inner">
          <Brand />
          <nav aria-label="Main navigation" className="marketing-nav">
            <Link href="/#features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/health-check">Health check</Link>
          </nav>
          <Link
            href="/login"
            className="marketing-button marketing-button-outline marketing-sign-in"
          >
            Sign in
          </Link>
        </div>
      </header>
    </>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-wrap marketing-footer-inner">
        <Brand />
        <nav aria-label="Legal" className="marketing-legal-links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/dpa">DPA</Link>
        </nav>
        <p>{recordsDisclaimer}</p>
      </div>
    </footer>
  );
}
