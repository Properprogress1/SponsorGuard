import { LegalPlaceholder } from "@/components/marketing/legal";
import { publicMetadata } from "@/lib/marketing/site";

export const metadata = publicMetadata(
  "Terms of service",
  "Draft placeholder for SponsorGuard UK’s terms of service.",
  "/terms",
  false,
);

export default function TermsPage() {
  return (
    <LegalPlaceholder
      title="Terms of service"
      subject="The published terms will describe service use, subscription terms and account responsibilities."
    />
  );
}
