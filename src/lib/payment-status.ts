/**
 * An order is only paid when its server-authoritative payment_status is paid.
 * Never infer payment success from Stripe redirect parameters.
 */
export type PaymentPresentation = {
  heading: string;
  description: string;
  kind: "success" | "error" | "neutral";
  verifiedPaid: boolean;
  canRetry: boolean;
  shouldPoll: boolean;
};
export function getPaymentPresentation({
  demo, loading, orderFound, paymentStatus,
}: {
  demo: boolean;
  loading: boolean;
  orderFound: boolean;
  paymentStatus?: string | null;
}): PaymentPresentation {
  if (demo) return {
    heading: "Demo checkout — no payment",
    description: "This was a demonstration. No real purchase or payment was completed.",
    kind: "neutral", verifiedPaid: false, canRetry: false, shouldPoll: false,
  };
  if (loading) return {
    heading: "Checking order status…",
    description: "Confirming the order with the marketplace.",
    kind: "neutral", verifiedPaid: false, canRetry: false, shouldPoll: false,
  };
  if (!orderFound) return {
    heading: "Order status unavailable",
    description: "The order or payment could not be verified. Check again or contact support.",
    kind: "neutral", verifiedPaid: false, canRetry: false, shouldPoll: true,
  };
  switch (paymentStatus?.trim().toLowerCase()) {
    case "paid": return {
      heading: "Payment received — thank you!",
      description: "Your payment is confirmed. Sellers can prepare the order.",
      kind: "success", verifiedPaid: true, canRetry: false, shouldPoll: false,
    };
    case "pending": return {
      heading: "Order received — payment pending",
      description: "Payment is not yet confirmed. Your order has not been released to sellers.",
      kind: "neutral", verifiedPaid: false, canRetry: true, shouldPoll: true,
    };
    case "failed": return {
      heading: "Payment failed — order not paid",
      description: "No successful payment is recorded. You may retry if the order remains eligible.",
      kind: "error", verifiedPaid: false, canRetry: true, shouldPoll: true,
    };
    case "partially_refunded": return {
      heading: "Order partially refunded",
      description: "Part of your order has been refunded. Check your order for retained items and amounts.",
      kind: "neutral", verifiedPaid: false, canRetry: false, shouldPoll: false,
    };
    case "refunded": return {
      heading: "Payment refunded",
      description: "This order was refunded. Do not attempt to pay it again.",
      kind: "neutral", verifiedPaid: false, canRetry: false, shouldPoll: false,
    };
    case "expired":
    case "cancelled":
    case "canceled": return {
      heading: "Order no longer payable",
      description: "Start a new checkout if you still wish to order these items.",
      kind: "neutral", verifiedPaid: false, canRetry: false, shouldPoll: false,
    };
    default: return {
      heading: "Payment status requires verification",
      description: "We cannot confirm payment. Check the order status again before proceeding.",
      kind: "neutral", verifiedPaid: false, canRetry: false, shouldPoll: true,
    };
  }
}
