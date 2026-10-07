import { createFileRoute } from "@tanstack/react-router";
import { ContentPage } from "@/components/ContentPage";
import { seoHead } from "@/seo/head";

export const Route = createFileRoute("/help")({
  head: () =>
    seoHead({
      title: "Help center — 1LV.CA",
      description: "How can we help? Browse common topics below or contact us at help@1lv.ca.",
      path: "/help",
    }),
  component: () => (
  <ContentPage kicker="Support" title="Help center">
    <p>How can we help? Browse common topics below or contact us at <strong>help@1lv.ca</strong>.</p>
    <h2>Orders & shipping</h2><p>Track orders from your account page. Most CA orders arrive in 3–7 business days.</p>
    <h2>Returns</h2><p>30-day returns on most items. See our <a href="/returns">returns policy</a>.</p>
    <h2>Vendors</h2><p>Apply to sell on the <a href="/become-a-vendor">become a vendor</a> page.</p>
  </ContentPage>
)});
