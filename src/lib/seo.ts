export const siteConfig = {
  name: "SkillHiive",
  description: "A developer collaboration platform built for presence, not performance. No algorithms. No leaderboards. Just intentional work with allies.",
  url: "https://skillhiive.com",
  ogImage: "/og-image.png",
  twitterHandle: "@skillhiive",
  organization: {
    name: "SkillHiive",
    url: "https://skillhiive.com",
    logo: "https://skillhiive.com/logo.png",
    sameAs: [
      "https://github.com/SkillHiive",
      "https://twitter.com/skillhiive",
    ],
  },
};

export type PageMeta = {
  title: string;
  description: string;
  path: string;
  ogType?: "website" | "article" | "profile";
  ogImage?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  jsonLd?: Record<string, unknown>[];
};

export const routeMeta: Record<string, PageMeta> = {
  "/": {
    title: "SkillHiive — Presence Over Performance",
    description: "A developer collaboration platform built for presence, not performance. No algorithms. No leaderboards. Just intentional work with allies. Open source by commitment.",
    path: "/",
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "SkillHiive",
        url: "https://skillhiive.com",
        logo: "https://skillhiive.com/logo.png",
        sameAs: [
          "https://github.com/SkillHiive",
          "https://twitter.com/skillhiive",
        ],
        description: "A developer collaboration platform built for presence, not performance. No algorithms. No leaderboards. Just intentional work with allies.",
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "SkillHiive",
        url: "https://skillhiive.com",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://skillhiive.com/search?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is SkillHiive?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "SkillHiive is a developer collaboration platform built for presence, not performance. No algorithms, no leaderboards, no performance to keep up — just intentional work with allies you choose.",
            },
          },
          {
            "@type": "Question",
            name: "Is SkillHiive open source?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. SkillHiive is developed transparently. The web client, mobile app, and backend services are all public on GitHub under the SkillHiive organization.",
            },
          },
          {
            "@type": "Question",
            name: "How is SkillHiive different from other platforms?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Most platforms optimize for engagement and time spent. SkillHiive optimizes for presence and intentional collaboration. No infinite feeds, no algorithmic sorting, no follower counts — just people who chose each other.",
            },
          },
        ],
      },
    ],
  },
  "/login": {
    title: "Sign In — SkillHiive",
    description: "Sign in to your SkillHiive account to join rooms, collaborate with allies, and build intentionally.",
    path: "/login",
    noIndex: true,
    noFollow: true,
  },
  "/register": {
    title: "Join SkillHiive — Create Your Account",
    description: "Join SkillHiive — a developer collaboration platform built for presence over performance. No algorithms, no leaderboards, just intentional work with allies.",
    path: "/register",
    ogType: "website",
  },
  "/home": {
    title: "Home — SkillHiive",
    description: "Your SkillHiive home. Join rooms, see updates from allies, and collaborate with intention.",
    path: "/home",
    noIndex: true,
    noFollow: true,
  },
  "/learn": {
    title: "Learn — Courses from the Hive",
    description: "Courses from the SkillHiive community. Cohort-based learning, peer mentorship, and intentional skill sharing for developers.",
    path: "/learn",
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "SkillHiive Courses",
        description: "Community-driven courses for developers",
        itemListElement: [],
      },
    ],
  },
  "/feed": {
    title: "Feed — SkillHiive",
    description: "Updates from your allies. Projects, offers, and media shared intentionally.",
    path: "/feed",
    noIndex: true,
    noFollow: true,
  },
  "/profile": {
    title: "Your Profile — SkillHiive",
    description: "Manage your SkillHiive profile, allies, and posts.",
    path: "/profile",
    noIndex: true,
    noFollow: true,
  },
  "/notifications": {
    title: "Notifications — SkillHiive",
    description: "Your SkillHiive notifications.",
    path: "/notifications",
    noIndex: true,
    noFollow: true,
  },
  "/settings/profile": {
    title: "Profile Settings — SkillHiive",
    description: "Update your SkillHiive profile settings.",
    path: "/settings/profile",
    noIndex: true,
    noFollow: true,
  },
};

export function getPageMeta(pathname: string, dynamicParams?: Record<string, string>): PageMeta {
  const exactMatch = routeMeta[pathname];
  if (exactMatch) return exactMatch;

  const dynamicRoutes: Array<{ pattern: RegExp; meta: PageMeta }> = [
    {
      pattern: /^\/profile\/([^/]+)$/,
      meta: {
        title: "",
        description: "",
        path: "/profile/:id",
        ogType: "profile",
      },
    },
    {
      pattern: /^\/post\/([^/]+)$/,
      meta: {
        title: "",
        description: "",
        path: "/post/:postId",
        ogType: "article",
      },
    },
    {
      pattern: /^\/rooms\/([^/]+)$/,
      meta: {
        title: "Room — SkillHiive",
        description: "Collaborative workspace room on SkillHiive.",
        path: "/rooms/:roomName",
        noIndex: true,
        noFollow: true,
      },
    },
  ];

  for (const route of dynamicRoutes) {
    const match = pathname.match(route.pattern);
    if (match) {
      const meta = { ...route.meta };
      if (dynamicParams) {
        if (meta.title.includes(":") && dynamicParams.id) {
          meta.title = `${dynamicParams.id} — SkillHiive`;
        }
        if (meta.description.includes(":") && dynamicParams.id) {
          meta.description = `View ${dynamicParams.id}'s profile on SkillHiive.`;
        }
      }
      return meta;
    }
  }

  return {
    title: "SkillHiive",
    description: siteConfig.description,
    path: pathname,
    noIndex: true,
  };
}

export function generateCanonicalUrl(pathname: string): string {
  return `${siteConfig.url}${pathname}`;
}

export function generateJsonLd(schemas: Record<string, unknown>[]): string {
  return JSON.stringify(schemas, null, 2);
}