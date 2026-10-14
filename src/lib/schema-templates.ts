/** Mẫu schema.org B2B — dùng chung cho form client và server. */

export type FieldKind = "text" | "textarea" | "url" | "list" | "faq" | "breadcrumb";

export interface TemplateField {
  key: string;
  kind: FieldKind;
  required?: boolean;
}

export interface SchemaTemplate {
  type: string;
  fields: TemplateField[];
}

export const SCHEMA_TEMPLATES: SchemaTemplate[] = [
  {
    type: "Organization",
    fields: [
      { key: "name", kind: "text", required: true },
      { key: "url", kind: "url", required: true },
      { key: "logo", kind: "url" },
      { key: "description", kind: "textarea" },
      { key: "email", kind: "text" },
      { key: "telephone", kind: "text" },
      { key: "address", kind: "text" },
      { key: "taxID", kind: "text" },
      { key: "foundingDate", kind: "text" },
      { key: "sameAs", kind: "list" },
    ],
  },
  {
    type: "LocalBusiness",
    fields: [
      { key: "name", kind: "text", required: true },
      { key: "url", kind: "url", required: true },
      { key: "image", kind: "url" },
      { key: "telephone", kind: "text" },
      { key: "address", kind: "text", required: true },
      { key: "openingHours", kind: "text" },
      { key: "priceRange", kind: "text" },
    ],
  },
  {
    type: "Service",
    fields: [
      { key: "name", kind: "text", required: true },
      { key: "description", kind: "textarea" },
      { key: "url", kind: "url" },
      { key: "serviceType", kind: "text" },
      { key: "areaServed", kind: "text" },
      { key: "audience", kind: "text" },
    ],
  },
  {
    type: "Product",
    fields: [
      { key: "name", kind: "text", required: true },
      { key: "description", kind: "textarea" },
      { key: "url", kind: "url" },
      { key: "image", kind: "url" },
      { key: "sku", kind: "text" },
      { key: "brand", kind: "text" },
      { key: "price", kind: "text" },
      { key: "priceCurrency", kind: "text" },
    ],
  },
  {
    type: "FAQPage",
    fields: [{ key: "faq", kind: "faq", required: true }],
  },
  {
    type: "BreadcrumbList",
    fields: [{ key: "breadcrumb", kind: "breadcrumb", required: true }],
  },
  {
    type: "Article",
    fields: [
      { key: "headline", kind: "text", required: true },
      { key: "url", kind: "url" },
      { key: "image", kind: "url" },
      { key: "author", kind: "text" },
      { key: "datePublished", kind: "text" },
      { key: "description", kind: "textarea" },
    ],
  },
];

export type SchemaInput = Record<string, string | string[] | { a: string; b: string }[]>;

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  ) as T;
}

export function buildJsonLd(
  type: string,
  input: SchemaInput,
  ctx: { locale: string; orgName: string; orgUrl: string },
): Record<string, unknown> {
  const base = { "@context": "https://schema.org", "@type": type };
  const publisher = { "@type": "Organization", name: ctx.orgName, url: ctx.orgUrl };
  const pairs = (k: string) => ((input[k] as { a: string; b: string }[]) ?? []).filter((p) => p.a?.trim());

  switch (type) {
    case "Organization":
      return clean({
        ...base,
        name: s(input.name),
        url: s(input.url),
        logo: s(input.logo),
        description: s(input.description),
        email: s(input.email),
        telephone: s(input.telephone),
        taxID: s(input.taxID),
        foundingDate: s(input.foundingDate),
        address: s(input.address) && { "@type": "PostalAddress", streetAddress: s(input.address) },
        contactPoint: s(input.telephone) && {
          "@type": "ContactPoint",
          telephone: s(input.telephone),
          contactType: "sales",
          availableLanguage: ctx.locale,
        },
        sameAs: ((input.sameAs as string[]) ?? []).filter(Boolean),
      });
    case "LocalBusiness":
      return clean({
        ...base,
        name: s(input.name),
        url: s(input.url),
        image: s(input.image),
        telephone: s(input.telephone),
        priceRange: s(input.priceRange),
        openingHours: s(input.openingHours),
        address: s(input.address) && { "@type": "PostalAddress", streetAddress: s(input.address) },
      });
    case "Service":
      return clean({
        ...base,
        name: s(input.name),
        description: s(input.description),
        url: s(input.url),
        serviceType: s(input.serviceType),
        areaServed: s(input.areaServed),
        audience: s(input.audience) && { "@type": "BusinessAudience", audienceType: s(input.audience) },
        provider: publisher,
        inLanguage: ctx.locale,
      });
    case "Product":
      return clean({
        ...base,
        name: s(input.name),
        description: s(input.description),
        url: s(input.url),
        image: s(input.image),
        sku: s(input.sku),
        brand: s(input.brand) && { "@type": "Brand", name: s(input.brand) },
        offers: s(input.price) && {
          "@type": "Offer",
          price: s(input.price),
          priceCurrency: s(input.priceCurrency) ?? "VND",
          availability: "https://schema.org/InStock",
          seller: publisher,
          businessFunction: "http://purl.org/goodrelations/v1#Sell",
        },
      });
    case "FAQPage":
      return {
        ...base,
        inLanguage: ctx.locale,
        mainEntity: pairs("faq").map((p) => ({
          "@type": "Question",
          name: p.a.trim(),
          acceptedAnswer: { "@type": "Answer", text: p.b.trim() },
        })),
      };
    case "BreadcrumbList":
      return {
        ...base,
        itemListElement: pairs("breadcrumb").map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: p.a.trim(),
          item: p.b.trim() || undefined,
        })),
      };
    case "Article":
      return clean({
        ...base,
        headline: s(input.headline),
        url: s(input.url),
        image: s(input.image),
        description: s(input.description),
        datePublished: s(input.datePublished),
        author: s(input.author) && { "@type": "Person", name: s(input.author) },
        publisher,
        inLanguage: ctx.locale,
      });
    default:
      return base;
  }
}
