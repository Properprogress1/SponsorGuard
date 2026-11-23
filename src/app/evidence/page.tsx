import type { Metadata } from "next";
import { EvidenceUpload } from "@/components/operations/evidence-upload";

export const metadata: Metadata = {
  title: "Submit evidence | SponsorGuard UK",
  robots: { index: false, follow: false },
};

export default function EvidencePage() {
  return (
    <main className="mx-auto grid max-w-xl gap-5 p-8">
      <h1 className="text-3xl font-semibold">Submit evidence</h1>
      <p>
        Upload the file requested by your employer. The file will be checked and
        reviewed before it is filed.
      </p>
      <EvidenceUpload />
    </main>
  );
}
