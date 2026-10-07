/**
 * SEO + consent kit: the ONE settings file per site.
 *
 * Rules:
 * - Only facts already present in this repo. Never invent an address, hours, phone, rating or review.
 * - Unknown values stay `undefined` with a `TODO(owner)` comment; the JSON-LD builder skips them.
 * - `url` is the real production domain (see foodhubca/private/hosting/MOCHAHOST_DOMAINS.md), never *.lovable.app.
 */

export type SchemaType =
  "Organization" | "LocalBusiness" | "Restaurant" | "NGO" | "SportsOrganization" | "Event";

export type PostalAddress = {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode?: string | undefined;
  addressCountry: string;
};

export type SiteConfig = {
  /** Public business name. */
  name: string;
  /** Legal name if different (TODO(owner) when unknown). */
  legalName?: string | undefined;
  /** Real production origin, no trailing slash. */
  url: string;
  /** <html lang>. French first (Québec). */
  lang: "fr-CA";
  /** Open Graph locale. */
  locale: "fr_CA";
  defaultTitle: string;
  defaultDescription: string;
  /** Default share image: path under /public or absolute URL. undefined = no og:image. */
  ogImage?: string | undefined;
  /** Logo: path under /public or absolute URL. */
  logo?: string | undefined;
  schemaType: SchemaType;
  email?: string | undefined;
  /** E.164, e.g. "+15145550000". */
  phone?: string | undefined;
  address?: PostalAddress | undefined;
  /** Real social profile URLs only (no "#", no generic facebook.com). */
  sameAs: string[];
  /** Privacy policy route, used by the cookie banner. undefined = no page yet (TODO(owner)). */
  privacyPath?: string | undefined;
  /** Law 25 privacy officer. */
  privacyOfficer: { name?: string | undefined; email?: string | undefined };
};

export const SITE: SiteConfig = {
  name: "1LV.CA",
  // TODO(owner): legal name of the company that operates 1LV.CA.
  legalName: undefined,
  url: "https://1lv.ca",
  lang: "fr-CA",
  locale: "fr_CA",
  // Existing English copy (root title + footer tagline). TODO(owner): French version (French first).
  defaultTitle: "1LV.CA — Canada's marketplace for everything",
  defaultDescription:
    "1LV.CA is Canada's marketplace for everyday essentials and unique finds — powered by trusted Canadian and global vendors.",
  // TODO(owner): add a real 1200x630 share image in public/ (the Lovable preview image was removed).
  ogImage: undefined,
  // TODO(owner): add a logo file in public/ (the logo is currently drawn in CSS, no image file).
  logo: undefined,
  schemaType: "Organization",
  // From the order confirmation page and admin settings. TODO(owner): confirm (the help page says help@1lv.ca).
  email: "support@1lv.ca",
  phone: undefined,
  address: undefined,
  // TODO(owner): real social profile URLs, if any.
  sameAs: [],
  privacyPath: "/privacy",
  // TODO(owner): name + email of the person responsible for personal information (Law 25).
  privacyOfficer: { name: undefined, email: undefined },
};
