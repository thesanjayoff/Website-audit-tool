import type { auditPages } from "../db/schema";

export type PageType = (typeof auditPages.$inferInsert)["pageType"];

type ClassifyInput = {
  url: string;
  baseUrl: string;
  linkText?: string;
  depth: number;
};

const LISTING_HINTS = ["/shop", "/products", "/category", "/categories", "/services", "/blog", "/news", "/portfolio", "/projects"];
const DETAIL_HINTS = ["/product/", "/item/", "/p/", "/listing/"];
const FORM_HINTS = ["/checkout", "/cart", "/signup", "/register", "/quote", "/book", "/apply", "/order"];
const CONTACT_HINTS = ["/contact", "/contact-us", "/get-in-touch"];
const CONTENT_HINTS = ["/blog/", "/news/", "/article", "/post/", "/insights/", "/resources/"];

/**
 * Heuristic page-type classifier used to prioritize which discovered URLs get
 * crawled when the total exceeds the page limit (home/listing/detail/
 * form/contact/content get priority over arbitrary other pages).
 */
export function classifyPage({ url, baseUrl }: ClassifyInput): PageType {
  const parsed = new URL(url);
  const base = new URL(baseUrl);
  const path = parsed.pathname.toLowerCase();

  if (parsed.origin === base.origin && (path === "/" || path === "")) return "home";

  if (CONTACT_HINTS.some((h) => path.includes(h))) return "contact";
  if (FORM_HINTS.some((h) => path.includes(h))) return "form";
  if (DETAIL_HINTS.some((h) => path.includes(h))) return "detail";
  if (CONTENT_HINTS.some((h) => path.includes(h))) return "content";
  if (LISTING_HINTS.some((h) => path.includes(h))) return "listing";

  // A path with multiple segments under a listing-like first segment usually
  // means "detail page" (e.g. /products/widget-123).
  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 2 && LISTING_HINTS.some((h) => h.includes(segments[0] ?? ""))) {
    return "detail";
  }

  return "other";
}

export const PAGE_TYPE_PRIORITY: Record<PageType, number> = {
  home: 0,
  contact: 1,
  form: 2,
  detail: 3,
  listing: 4,
  content: 5,
  other: 6,
};
