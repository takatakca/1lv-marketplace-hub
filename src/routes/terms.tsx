import { createFileRoute } from "@tanstack/react-router";
import { ContentPage } from "@/components/ContentPage";
import { seoHead } from "@/seo/head";
export const Route = createFileRoute("/terms")({
  head: () =>
    seoHead({
      title: "Terms of service — 1LV.CA",
      description:
        "By using 1LV.CA you agree to these terms. The marketplace is operated from Canada and prices are in CAD.",
      path: "/terms",
    }),
  component: () => (
  <ContentPage kicker="Legal" title="Terms of service">
    <p>By using 1LV.CA you agree to these terms. The marketplace is operated from Canada and prices are in CAD.</p>
  </ContentPage>
)});
