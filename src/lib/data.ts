// Sample seed data for the marketplace. Replace with Supabase queries later.

export type Category = {
  slug: string;
  name: string;
  emoji: string;
  subcategories: string[];
};

export type Vendor = {
  slug: string;
  name: string;
  rating: number;
  city: string;
  country: string;
  yearsActive: number;
};

export type Product = {
  id: string;
  slug: string;
  title: string;
  category: string; // slug
  vendorSlug: string;
  price: number; // CAD
  compareAt?: number;
  rating: number;
  reviews: number;
  sold: number;
  images: string[];
  tags: ("flash" | "trending" | "new" | "best" | "local")[];
  shipping: "fast" | "free" | "standard";
  variants?: { name: string; options: string[] }[];
  description: string;
};

export const categories: Category[] = [
  { slug: "electronics", name: "Electronics", emoji: "📱", subcategories: ["Phones", "Laptops", "Audio", "Wearables", "Cameras"] },
  { slug: "home", name: "Home & Kitchen", emoji: "🏠", subcategories: ["Decor", "Cookware", "Furniture", "Bedding", "Lighting"] },
  { slug: "fashion", name: "Fashion", emoji: "👕", subcategories: ["Men", "Women", "Kids", "Shoes", "Bags"] },
  { slug: "beauty", name: "Beauty & Health", emoji: "💄", subcategories: ["Skincare", "Makeup", "Hair", "Wellness"] },
  { slug: "sports", name: "Sports & Outdoors", emoji: "⚽", subcategories: ["Fitness", "Camping", "Cycling", "Winter"] },
  { slug: "toys", name: "Toys & Games", emoji: "🧸", subcategories: ["Board Games", "Plush", "Building", "Outdoor"] },
  { slug: "auto", name: "Auto & Tools", emoji: "🔧", subcategories: ["Tools", "Accessories", "Care"] },
  { slug: "pet", name: "Pet Supplies", emoji: "🐾", subcategories: ["Dog", "Cat", "Small Pets"] },
  { slug: "office", name: "Office & School", emoji: "📚", subcategories: ["Stationery", "Furniture", "Supplies"] },
  { slug: "garden", name: "Garden & Patio", emoji: "🌿", subcategories: ["Plants", "Tools", "Outdoor"] },
];

export const vendors: Vendor[] = [
  { slug: "northstar-tech", name: "Northstar Tech", rating: 4.8, city: "Montréal", country: "CA", yearsActive: 4 },
  { slug: "maple-home", name: "Maple Home Co.", rating: 4.7, city: "Toronto", country: "CA", yearsActive: 6 },
  { slug: "boreal-outfitters", name: "Boréal Outfitters", rating: 4.9, city: "Québec", country: "CA", yearsActive: 3 },
  { slug: "atlantic-style", name: "Atlantic Style", rating: 4.6, city: "Halifax", country: "CA", yearsActive: 5 },
  { slug: "pacific-pets", name: "Pacific Pets", rating: 4.8, city: "Vancouver", country: "CA", yearsActive: 2 },
  { slug: "global-bazaar", name: "Global Bazaar", rating: 4.4, city: "Shenzhen", country: "CN", yearsActive: 8 },
];

const img = (q: string, i = 1) =>
  `https://images.unsplash.com/photo-${q}?auto=format&fit=crop&w=800&q=80&sig=${i}`;

const seeds = [
  { q: "1505740420928-5e560c06d30e", t: "Wireless Studio Headphones", c: "electronics", v: "northstar-tech", p: 89.99, ca: 149.99, tags: ["flash", "best"] },
  { q: "1517336714731-489689fd1ca8", t: "14\" Ultrabook Laptop 16GB", c: "electronics", v: "northstar-tech", p: 1249, ca: 1499, tags: ["trending"] },
  { q: "1523275335684-37898b6baf30", t: "Smartwatch Pro Series 8", c: "electronics", v: "northstar-tech", p: 219, ca: 299, tags: ["best"] },
  { q: "1542291026-7eec264c27ff", t: "Air Cushion Running Shoes", c: "fashion", v: "atlantic-style", p: 64.99, ca: 119.99, tags: ["flash", "trending"] },
  { q: "1521572163474-6864f9cf17ab", t: "Organic Cotton Tee — 3 Pack", c: "fashion", v: "atlantic-style", p: 34.5, ca: 49.99, tags: ["new"] },
  { q: "1556228720-195a672e8a03", t: "Cast-Iron Dutch Oven 6QT", c: "home", v: "maple-home", p: 79, ca: 139, tags: ["best", "local"] },
  { q: "1493663284031-b7e3aefcae8e", t: "Linen Bedding Set Queen", c: "home", v: "maple-home", p: 119, ca: 179, tags: ["new", "local"] },
  { q: "1582719478250-c89cae4dc85b", t: "Aroma Diffuser + Oils", c: "beauty", v: "maple-home", p: 39.99, ca: 59.99, tags: ["trending"] },
  { q: "1556228453-efd6c1ff04f6", t: "Vitamin C Serum 30ml", c: "beauty", v: "maple-home", p: 24.99, ca: 39.99, tags: ["best"] },
  { q: "1517649763962-0c623066013b", t: "Yoga Mat Pro 6mm", c: "sports", v: "boreal-outfitters", p: 49, ca: 79, tags: ["new", "local"] },
  { q: "1551698618-1dfe5d97d256", t: "Insulated Camping Tent 4P", c: "sports", v: "boreal-outfitters", p: 229, ca: 329, tags: ["flash", "local"] },
  { q: "1585487000160-6ebcfceb0d03", t: "Wooden Building Blocks 100pc", c: "toys", v: "maple-home", p: 32.5, ca: 49.99, tags: ["new"] },
  { q: "1607734834519-d8576ae60ea7", t: "Cordless Drill Combo Kit", c: "auto", v: "northstar-tech", p: 149, ca: 219, tags: ["best"] },
  { q: "1583511655802-41f53e8ddef8", t: "Premium Dog Harness", c: "pet", v: "pacific-pets", p: 38, ca: 55, tags: ["trending", "local"] },
  { q: "1583337130417-3346a1be7dee", t: "Cat Tree Tower 120cm", c: "pet", v: "pacific-pets", p: 89, ca: 129, tags: ["new", "local"] },
  { q: "1517842645767-c639042777db", t: "Notebook Set + Pens", c: "office", v: "global-bazaar", p: 14.99, ca: 24.99, tags: ["flash"] },
  { q: "1416879595882-3373a0480b5b", t: "Indoor Plant Bundle", c: "garden", v: "maple-home", p: 45, ca: 69, tags: ["local", "new"] },
  { q: "1542291026-7eec264c27ff", t: "Trail Running Backpack 20L", c: "sports", v: "boreal-outfitters", p: 79, ca: 119, tags: ["trending", "local"] },
  { q: "1593359677879-a4bb92f829d1", t: "True Wireless Earbuds", c: "electronics", v: "northstar-tech", p: 49, ca: 99, tags: ["flash", "best"] },
  { q: "1560769629-975ec94e6a86", t: "Leather Sneakers Unisex", c: "fashion", v: "atlantic-style", p: 89, ca: 149, tags: ["best"] },
  { q: "1542838132-92c53300491e", t: "Stainless Espresso Maker", c: "home", v: "maple-home", p: 59, ca: 89, tags: ["trending", "local"] },
  { q: "1505740420928-5e560c06d30e", t: "Bluetooth Speaker Waterproof", c: "electronics", v: "northstar-tech", p: 39, ca: 69, tags: ["flash"] },
  { q: "1553062407-98eeb64c6a62", t: "Travel Duffel Bag 40L", c: "fashion", v: "atlantic-style", p: 55, ca: 89, tags: ["new"] },
  { q: "1526170375885-4d8ecf77b99f", t: "Reusable Water Bottle 1L", c: "sports", v: "boreal-outfitters", p: 22, ca: 35, tags: ["local"] },
];

export const products: Product[] = seeds.map((s, i) => ({
  id: `p_${i + 1}`,
  slug: s.t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + (i + 1),
  title: s.t,
  category: s.c,
  vendorSlug: s.v,
  price: s.p,
  compareAt: s.ca,
  rating: 4 + Math.round(Math.random() * 10) / 10,
  reviews: 12 + Math.floor(Math.random() * 980),
  sold: 50 + Math.floor(Math.random() * 9000),
  images: [img(s.q, i), img(s.q, i + 100), img(s.q, i + 200)],
  tags: s.tags as Product["tags"],
  shipping: i % 3 === 0 ? "fast" : i % 3 === 1 ? "free" : "standard",
  variants:
    s.c === "fashion"
      ? [{ name: "Size", options: ["S", "M", "L", "XL"] }, { name: "Color", options: ["Black", "Navy", "Sand"] }]
      : s.c === "electronics"
      ? [{ name: "Color", options: ["Midnight", "Silver"] }]
      : undefined,
  description:
    `Premium ${s.t.toLowerCase()} carefully sourced and shipped from a trusted ${s.v === "global-bazaar" ? "international" : "Canadian"} vendor. ` +
    "Backed by our 30-day return promise and Canadian customer support.",
}));

export const getProduct = (slug: string) => products.find((p) => p.slug === slug);
export const getVendor = (slug: string) => vendors.find((v) => v.slug === slug);
export const getCategory = (slug: string) => categories.find((c) => c.slug === slug);
export const productsByCategory = (slug: string) => products.filter((p) => p.category === slug);
export const productsByTag = (tag: Product["tags"][number]) => products.filter((p) => p.tags.includes(tag));

export const formatCAD = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
