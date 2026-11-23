import { PublicHealthCheck } from "@/components/marketing/health-check";
import { publicMetadata, recordsDisclaimer } from "@/lib/marketing/site";

export const metadata = publicMetadata(
  "Free licence health check",
  "A private, browser-only checklist for reviewing what sponsor records you have on file. No account needed.",
  "/health-check",
);

export default function HealthCheckPage() {
  return (
    <section className="marketing-wrap marketing-section marketing-narrow">
      <div className="marketing-intro">
        <h1>Free licence health check</h1>
        <p className="marketing-lead">
          A self-assessment of where you keep your sponsor records. No account
          or personal details are needed.
        </p>
        <p className="health-check-disclaimer">{recordsDisclaimer}</p>
      </div>
      <PublicHealthCheck />
    </section>
  );
}
