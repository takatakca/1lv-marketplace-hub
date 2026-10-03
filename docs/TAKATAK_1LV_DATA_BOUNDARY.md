# GROUPE TAKATAK ↔ 1LV data boundary

## Authority model

GROUPE TAKATAK is the master customer and identity platform for the ecosystem.
1LV.CA remains an independent marketplace and remains the system of record for
its own commerce, accounting and financial operations.

The integration direction is:

```text
1LV -> GROUPE TAKATAK -> master identity / CRM / relationship graph
GROUPE TAKATAK -> 1LV -> only the identity/authorization data 1LV is permitted to use
```

A TAKATAK child application never reads or writes another child application's
business database directly.

## Data that may be synchronized to GROUPE TAKATAK

- verified master identity reference
- customer local profile reference
- customer name, verified/collected phone and email
- preferred language
- province/country and customer-provided contact context
- consent/audit references
- merchant/company relationship references
- first/last customer interaction timestamps
- order-count relationship metadata without monetary values
- dispute references needed for support/intermediation
- 1LV merchant identity and operational status needed for administration

## Data that remains exclusively inside 1LV

GROUPE TAKATAK must not become the system of record or custodian for:

- order totals or vendor subtotals
- payment status or payment instruments
- Stripe PaymentIntent, Customer, Charge, Refund or Transfer data
- card or bank information
- invoices and accounting ledgers
- refunds and refund accounting
- vendor payouts and payout adjustments
- platform fees or commissions
- lifetime monetary value
- settlement or reconciliation data

1LV owns those records and the associated financial lifecycle. TAKATAK may
assist with customer support or dispute administration using references, but it
does not take ownership of the payment transaction or financial ledger.

## Enforcement

The 1LV integration enforces this boundary in three places:

1. event builders only create customer/merchant/relationship projections;
2. the TAKATAK HTTP client rejects financial payload keys and suppresses legacy
   order aggregates before network transmission;
3. `npm run check:architecture` fails CI if financial fields are reintroduced
   into the TAKATAK outbox or mappers.

Historical 1LV order outbox rows are acknowledged locally without being
transmitted to GROUPE TAKATAK.
