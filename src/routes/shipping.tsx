import { createFileRoute } from "@tanstack/react-router";
import { ContentPage } from "@/components/ContentPage";
export const Route = createFileRoute("/shipping")({ component: () => (
  <ContentPage kicker="Policy" title="Shipping">
    <p>We ship across Canada with Canada Post, Purolator and partner couriers.</p>
    <ul><li>Free standard shipping on Canadian orders over $49 CAD</li><li>Express 2-day shipping available on eligible items</li><li>International shipping varies by vendor</li></ul>
  </ContentPage>
)});
