import { createFileRoute, Link } from "@tanstack/react-router";
import { ContentPage } from "@/components/ContentPage";

export const Route = createFileRoute("/returns")({
  component: Returns,
  head: () => ({
    meta: [
      { title: "Returns and refunds — 1LV.CA" },
      {
        name: "description",
        content: "How returns, refunds, disputes and merchant-specific return terms work on the 1LV.CA marketplace.",
      },
    ],
  }),
});

function Returns() {
  return (
    <ContentPage kicker="Buyer protection" title="Returns & refunds">
      <p>
        Most eligible items can be requested for return within 30 days of delivery. Because 1LV.CA is a multi-vendor
        marketplace, the exact return conditions shown on the product or merchant storefront can also apply.
      </p>

      <h2>Start from the order record</h2>
      <p>
        Use your <Link to="/orders">orders page</Link> to open the transaction and report a problem. Keeping the request
        attached to the order allows 1LV.CA, the merchant and the payment record to stay synchronized.
      </p>

      <h2>Typical return requirements</h2>
      <ul>
        <li>the return request is made within the applicable return window;</li>
        <li>the item is returned with required components, accessories and packaging when reasonably applicable;</li>
        <li>the product is not in a non-returnable category disclosed before purchase;</li>
        <li>the customer follows the provided return or shipping instructions.</li>
      </ul>

      <h2>Damaged, incorrect or not-as-described items</h2>
      <p>
        Report damaged, incorrect, missing or materially misdescribed items through the order-dispute flow. Photos,
        shipment information or other evidence may be requested to resolve the claim.
      </p>

      <h2>Refund timing</h2>
      <p>
        Approved refunds are sent through the applicable payment workflow. Bank or card-network posting time can occur
        after 1LV.CA or the payment provider marks a refund as processed.
      </p>

      <h2>Merchant-specific policies</h2>
      <p>
        A merchant may publish more generous return terms, but cannot use a marketplace policy to remove customer rights
        that cannot legally be waived. Where a merchant-specific policy conflicts with a mandatory legal right, the
        mandatory right prevails.
      </p>

      <h2>Need help?</h2>
      <p>
        If the order tools do not resolve the issue, contact <strong>support@1lv.ca</strong> with the order number.
      </p>
    </ContentPage>
  );
}
