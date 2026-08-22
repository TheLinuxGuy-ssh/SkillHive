import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router";
import { getPageMeta, generateCanonicalUrl, generateJsonLd, siteConfig } from "@/lib/seo";

interface SEOProps {
  customMeta?: Partial<{
    title: string;
    description: string;
    ogImage: string;
    ogType: "website" | "article" | "profile";
    noIndex: boolean;
    noFollow: boolean;
    jsonLd: Record<string, unknown>[];
  }>;
  dynamicParams?: Record<string, string>;
}

export default function SEO({ customMeta = {}, dynamicParams = {} }: SEOProps) {
  const location = useLocation();
  const pageMeta = getPageMeta(location.pathname, dynamicParams);

  const title = customMeta.title ?? pageMeta.title;
  const description = customMeta.description ?? pageMeta.description;
  const ogImage = customMeta.ogImage ?? pageMeta.ogImage ?? siteConfig.ogImage;
  const ogType = customMeta.ogType ?? pageMeta.ogType ?? "website";
  const noIndex = customMeta.noIndex ?? pageMeta.noIndex ?? false;
  const noFollow = customMeta.noFollow ?? pageMeta.noFollow ?? false;
  const jsonLd = customMeta.jsonLd ?? pageMeta.jsonLd ?? [];
  const canonicalUrl = generateCanonicalUrl(location.pathname);

  const robotsContent = [
    noIndex ? "noindex" : "index",
    noFollow ? "nofollow" : "follow",
  ].join(", ");

  return (
    <Helmet>
      <html lang="en" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robotsContent} />
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content={siteConfig.name} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={siteConfig.twitterHandle} />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {jsonLd.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: generateJsonLd(jsonLd) }}
        />
      )}
    </Helmet>
  );
}