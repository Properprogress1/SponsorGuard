import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/shell";
import "@fontsource/instrument-serif/latin-400.css";
import "./marketing.css";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="marketing">
      <MarketingHeader />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
