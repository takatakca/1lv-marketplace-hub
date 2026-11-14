import { createFileRoute } from "@tanstack/react-router";
import { ContentPage } from "@/components/ContentPage";

export const Route = createFileRoute("/terms")({
  component: Terms,
  head: () => ({
    meta: [
      { title: "Marketplace terms — 1LV.CA" },
      {
        name: "description",
        content: "Terms governing customer and merchant use of the 1LV.CA Canadian multi-vendor marketplace.",
      },
    ],
  }),
});

function Terms() {
  return (
    <ContentPage kicker="Legal" title="Marketplace terms of service">
      <p>
        <strong>Effective September 30, 2026.</strong> These terms govern use of 1LV.CA. By creating an account,
        placing an order, applying as a merchant or otherwise using the marketplace, you agree to these terms and any
        additional terms presented for a specific service.
      </p>

      <h2>Marketplace model</h2>
      <p>
        1LV.CA operates a multi-vendor marketplace. Products can be offered and fulfilled by independent merchants.
        The seller shown on a product or order is responsible for the accuracy of its listing, lawful sale of its
        products and fulfilment obligations, subject to 1LV.CA marketplace rules and buyer-protection processes.
      </p>

      <h2>Pricing, currency and taxes</h2>
      <p>
        Marketplace prices are displayed in Canadian dollars unless clearly stated otherwise. Shipping and estimated
        sales taxes are shown before payment. Tax treatment can depend on the product, seller, customer location and
        applicable place-of-supply or provincial tax rules.
      </p>

      <h2>Orders and payment</h2>
      <p>
        Submitting checkout creates an order request. An order may remain pending until payment is authorized or
        completed. 1LV.CA may cancel or correct an order when a product is unavailable, a price or inventory error is
        identified, payment fails, fraud is suspected, or fulfilment would violate law or marketplace policy.
      </p>

      <h2>Multi-vendor fulfilment</h2>
      <p>
        One checkout can contain items from several merchants. Each merchant portion can be processed, shipped,
        delivered, returned, refunded or disputed separately while remaining associated with the same parent order.
      </p>

      <h2>Returns, refunds and disputes</h2>
      <p>
        Returns and refunds are governed by the 1LV.CA return policy, the applicable merchant policy and non-waivable
        consumer rights. If an order has a problem, customers should use the order or dispute tools so the transaction
        can be reviewed through the marketplace record.
      </p>

      <h2>Customer accounts</h2>
      <p>
        You are responsible for keeping account credentials secure and for activity performed through your account.
        Contact support promptly if you believe an account or transaction has been compromised.
      </p>

      <h2>Merchant obligations</h2>
      <p>
        Merchants must provide accurate business and product information, maintain lawful inventory, honour published
        fulfilment and return commitments, respond to marketplace disputes, and comply with applicable tax, product,
        consumer-protection, privacy and advertising requirements.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Users may not misuse the marketplace, interfere with security controls, scrape or probe protected systems,
        commit fraud, impersonate others, manipulate reviews or transactions, or use 1LV.CA to offer unlawful,
        prohibited or infringing products.
      </p>

      <h2>Service changes</h2>
      <p>
        Marketplace features, fees, integrations and policies may evolve. Material updates to these terms will be
        posted here with a revised effective date and additional notice where required.
      </p>

      <h2>Applicable rights</h2>
      <p>
        Nothing in these terms excludes rights or remedies that cannot legally be waived under applicable Canadian or
        provincial law. Questions about these terms can be sent to <strong>support@1lv.ca</strong>.
      </p>
    </ContentPage>
  );
}
