import { createFileRoute } from "@tanstack/react-router";
import { ContentPage } from "@/components/ContentPage";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: () => ({
    meta: [
      { title: "Privacy policy — 1LV.CA" },
      {
        name: "description",
        content: "How 1LV.CA collects, uses, shares and protects customer and merchant information in its Canadian marketplace.",
      },
    ],
  }),
});

function Privacy() {
  return (
    <ContentPage kicker="Privacy" title="Privacy policy">
      <p>
        <strong>Effective September 30, 2026.</strong> This policy explains how 1LV.CA handles personal information
        when customers shop, merchants sell, or people otherwise use the marketplace. Our privacy program is designed
        around applicable Canadian privacy requirements, including Québec private-sector privacy requirements and
        PIPEDA where applicable.
      </p>

      <h2>Information we collect</h2>
      <p>Depending on how you use 1LV.CA, we may collect:</p>
      <ul>
        <li>account information such as name, email address, phone number and preferred language;</li>
        <li>shipping, billing and order information needed to complete marketplace transactions;</li>
        <li>merchant and business information supplied during vendor onboarding and account administration;</li>
        <li>support, dispute, refund and fraud-prevention information;</li>
        <li>technical and usage information needed to secure, operate and improve the marketplace.</li>
      </ul>
      <p>
        Payment card details are handled through payment providers such as Stripe when enabled. 1LV.CA does not need
        to store raw card numbers in its application database.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>to create accounts, authenticate users and provide customer or merchant services;</li>
        <li>to process orders, payments, shipping, returns, disputes and refunds;</li>
        <li>to prevent fraud, abuse and security incidents;</li>
        <li>to provide support and marketplace communications;</li>
        <li>to operate analytics, improve marketplace performance and meet legal or regulatory obligations.</li>
      </ul>

      <h2>TAKATAK master customer and merchant platform</h2>
      <p>
        1LV.CA is part of the TAKATAK-managed business ecosystem. Normalized customer, merchant, order and relationship
        events may be sent to the TAKATAK master platform for centralized identity resolution, CRM administration,
        support, security, reporting and cross-service account management where permitted by law.
      </p>
      <p>
        TAKATAK may recognize that the same person interacts with more than one TAKATAK-managed business or platform.
        That global identity relationship does <strong>not</strong> give an individual 1LV.CA merchant unrestricted
        access to that person's activity with other merchants or businesses. Merchant-facing access remains scoped to
        the information required for that merchant's own marketplace relationship and orders.
      </p>

      <h2>When information is shared</h2>
      <p>We may disclose information only as reasonably required for marketplace operations, including to:</p>
      <ul>
        <li>the merchant or merchants fulfilling an order, limited to information needed to serve that order;</li>
        <li>payment, hosting, communications, fraud-prevention, analytics and delivery service providers;</li>
        <li>TAKATAK systems and authorized personnel for the purposes described above;</li>
        <li>government, regulatory, law-enforcement or legal parties where disclosure is required or permitted by law.</li>
      </ul>

      <h2>Processing outside Québec or Canada</h2>
      <p>
        Some service providers may process or store information outside Québec or Canada. When cross-border processing
        is used, we assess the service and safeguards appropriate to the sensitivity and purpose of the information and
        apply contractual or technical protections where appropriate.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep personal information only as long as reasonably necessary for the purposes described in this policy,
        including transaction records, fraud prevention, accounting, dispute handling and legal obligations. Retention
        periods can differ by record type. Information that no longer needs to be retained is deleted, anonymized or
        otherwise handled according to applicable requirements.
      </p>

      <h2>Your privacy rights</h2>
      <p>
        Subject to applicable law and exceptions, you may ask to access or correct personal information associated with
        you and may withdraw consent where consent is the legal basis for a use. Some information must still be retained
        or used to complete transactions, protect the marketplace or meet legal obligations.
      </p>

      <h2>Security</h2>
      <p>
        We use role-based access, database row-level security, restricted administrative functions, encrypted transport
        and third-party payment infrastructure to reduce risk. No system can guarantee absolute security. We maintain
        procedures to investigate and respond to suspected confidentiality or security incidents.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy or data-access questions can be sent to <strong>support@1lv.ca</strong>. Requests may require identity
        verification before account-specific information is released or changed.
      </p>
    </ContentPage>
  );
}
