import { createFileRoute } from "@tanstack/react-router";
import { ContentPage } from "@/components/ContentPage";
export const Route = createFileRoute("/privacy")({ component: () => (
  <ContentPage kicker="Legal" title="Privacy policy">
    <p>1LV.CA respects your privacy. We collect only the data needed to operate the marketplace and process your orders, in compliance with PIPEDA and Quebec Law 25.</p>
  </ContentPage>
)});
