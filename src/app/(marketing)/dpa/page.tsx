import { LegalPlaceholder } from "@/components/marketing/legal";
import { publicMetadata } from "@/lib/marketing/site";

export const metadata = publicMetadata(
  "Data processing agreement",
  "Draft placeholder for SponsorGuard UK’s data processing agreement.",
  "/dpa",
  false,
);

export default function DpaPage() {
  return (
    <LegalPlaceholder
      title="Data processing agreement"
      subject="The published agreement will set out processing instructions, security responsibilities and subprocessor arrangements."
    />
  );
}
