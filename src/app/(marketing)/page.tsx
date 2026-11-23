import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  FolderLock,
  Network,
  NotebookTabs,
} from "lucide-react";
import { publicMetadata } from "@/lib/marketing/site";

export const metadata = publicMetadata(
  "Records for UK sponsor licence holders",
  "Organise sponsor records, track follow-ups and share time-stamped evidence with SponsorGuard UK. Start with a free licence health check.",
  "/",
);

const features = [
  {
    title: "People and right to work",
    text: "See workers, engagement categories and checks on file, with recorded follow-up dates.",
    icon: Network,
  },
  {
    title: "Weekly actions and handovers",
    text: "See what is due this week, assign an owner and hand actions back to the client after review.",
    icon: CalendarClock,
  },
  {
    title: "Document vault and audit packs",
    text: "Request a file securely, review it before filing and export an audit pack when records are needed.",
    icon: FolderLock,
  },
];

export default function Home() {
  return (
    <>
      <section className="marketing-wrap marketing-hero">
        <div className="marketing-hero-copy">
          <p className="marketing-eyebrow">For UK sponsor licence holders</p>
          <h1>Keep your sponsorship records in order.</h1>
          <p className="marketing-lead">
            See what’s due, collect evidence from your team and share a
            time-stamped record with your adviser.
          </p>
          <div className="marketing-actions">
            <Link
              href="/health-check"
              className="marketing-button marketing-button-primary"
            >
              Start free health check{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              href="/pricing"
              className="marketing-button marketing-button-outline"
            >
              View pricing
            </Link>
          </div>
        </div>
        <section className="marketing-preview" aria-labelledby="example-queue">
          <p className="marketing-preview-label">Example workspace</p>
          <h2 id="example-queue">This week’s actions</h2>
          <ul>
            <li>
              <CalendarClock size={20} aria-hidden="true" />
              <strong>Complete a reporting task</strong>
              <span>Due today · Assigned</span>
            </li>
            <li>
              <FolderLock size={20} aria-hidden="true" />
              <strong>Review a document expiry</strong>
              <span>Due Friday · Unassigned</span>
            </li>
            <li>
              <NotebookTabs size={20} aria-hidden="true" />
              <strong>Follow up a right-to-work check</strong>
              <span>Handed back for review</span>
            </li>
          </ul>
        </section>
      </section>
      <section
        className="marketing-passport"
        aria-labelledby="passport-heading"
      >
        <div className="marketing-wrap marketing-passport-inner">
          <div className="marketing-passport-icon">
            <NotebookTabs size={36} aria-hidden="true" />
          </div>
          <div>
            <h2 id="passport-heading">The Compliance Passport</h2>
            <p>
              A tamper-evident ledger of record changes. On Pro, share a
              read-only, expiring view with advisers or clients and revoke
              access when needed.
            </p>
          </div>
          <Link
            href="/pricing"
            className="marketing-button marketing-button-on-dark"
          >
            Compare plans <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section
        className="marketing-wrap marketing-features"
        id="features"
        aria-labelledby="features-heading"
      >
        <h2 id="features-heading">Built for small sponsor teams</h2>
        <div className="marketing-card-grid">
          {features.map(({ title, text, icon: Icon }) => (
            <article className="marketing-card" key={title}>
              <Icon size={23} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
