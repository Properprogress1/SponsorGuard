import { LegalPlaceholder } from "@/components/marketing/legal";
import { publicMetadata } from "@/lib/marketing/site";

export const metadata = publicMetadata(
  "Privacy notice",
  "Draft placeholder for SponsorGuard UK’s privacy notice.",
  "/privacy",
  false,
);

export default function PrivacyPage() {
  return (
    <LegalPlaceholder
      title="Privacy notice"
      subject="The published notice will explain what personal data is processed, why it is used and how to exercise privacy rights."
    />
  );
}
