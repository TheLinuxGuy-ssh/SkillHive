import fs from "fs";
import path from "path";

const SITE_URL = "https://skillhiive.com";

const staticRoutes = [
  { path: "/", changefreq: "weekly", priority: 1.0 },
  { path: "/login", changefreq: "monthly", priority: 0.3 },
  { path: "/register", changefreq: "monthly", priority: 0.5 },
  { path: "/learn", changefreq: "daily", priority: 0.8 },
];

const dynamicRoutes = [];

const lastmod = new Date().toISOString().split("T")[0];

function generateSitemap() {
  const urls = staticRoutes.map((route) => {
    return `  <url>
    <loc>${SITE_URL}${route.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`;
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>`;

  const publicDir = path.resolve("public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), sitemap);
  console.log("✅ sitemap.xml generated at public/sitemap.xml");
}

function generateRobots() {
  const robots = `# SkillHiive robots.txt
User-agent: *
Allow: /

# Disallow private/authenticated routes
Disallow: /home
Disallow: /feed
Disallow: /profile
Disallow: /notifications
Disallow: /settings
Disallow: /rooms/
Disallow: /post/

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml
`;

  fs.writeFileSync(path.join(path.resolve("public"), "robots.txt"), robots);
  console.log("✅ robots.txt generated at public/robots.txt");
}

generateSitemap();
generateRobots();