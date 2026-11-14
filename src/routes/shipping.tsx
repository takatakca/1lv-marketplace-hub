import { createFileRoute } from "@tanstack/react-router";
import { ContentPage } from "@/components/ContentPage";
import {
  FREE_SHIPPING_THRESHOLD_CAD,
  STANDARD_SHIPPING_FEE_CAD,
} from "@/lib/canada-commerce";
import { formatCAD } from "@/lib/data";

export const Route = createFileRoute("/shipping")({
  component: Shipping,
  head: () => ({
    meta: [
      { title: "Shipping across Canada — 1LV.CA" },
      {
        name: "description",
        content: "1LV.CA shipping information for Canadian marketplace orders, delivery estimates, tracking and vendor fulfilment.",
      },
    ],
  }),
});

function Shipping() {
  return (
    <ContentPage kicker="Delivery" title="Shipping across Canada">
      <p>
        1LV.CA is a multi-vendor marketplace. Delivery speed, carrier and origin can vary by item and seller, and the
        order detail page remains the source of truth for tracking once a shipment is created.
      </p>

      <h2>Standard shipping</h2>
      <ul>
        <li>Free standard shipping is available when the eligible merchandise subtotal reaches {formatCAD(FREE_SHIPPING_THRESHOLD_CAD)}.</li>
        <li>Below that threshold, the current standard marketplace shipping charge is {formatCAD(STANDARD_SHIPPING_FEE_CAD)}.</li>
        <li>Some products or vendors can offer their own free or expedited shipping terms.</li>
      </ul>

      <h2>Delivery estimates</h2>
      <p>
        Estimated delivery dates are shown when available and are not guarantees. Remote destinations, weather,
        carrier delays, customs processing and vendor handling times can affect delivery.
      </p>

      <h2>Tracking and split shipments</h2>
      <p>
        A single 1LV.CA checkout can contain products from multiple merchants. Those items may ship separately and
        receive separate tracking numbers while remaining part of the same marketplace order.
      </p>

      <h2>Canadian taxes</h2>
      <p>
        Estimated sales tax is calculated at checkout from the ship-to province or territory and the current tax
        profile used by 1LV.CA. Product taxability and applicable tax rules can affect the final amount.
      </p>
    </ContentPage>
  );
}
