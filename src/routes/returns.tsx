import { createFileRoute } from "@tanstack/react-router";
import { ContentPage } from "@/components/ContentPage";
import { seoHead } from "@/seo/head";
export const Route = createFileRoute("/returns")({
  head: () =>
    seoHead({
      title: "Returns & refunds — 1LV.CA",
      description:
        "We offer 30-day returns on most items. Items must be unused and in original packaging.",
      path: "/returns",
    }),
  component: () => (
  <ContentPage kicker="Policy" title="Returns & refunds">
    <p>We offer 30-day returns on most items. Items must be unused and in original packaging.</p>
    <p>To start a return, visit your <a href="/orders">orders page</a> and select the item.</p>
  </ContentPage>
)});
