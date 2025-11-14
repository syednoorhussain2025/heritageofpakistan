// lib/urls.ts
export type LinkableSite = { slug: string; province_slug: string };

export const siteHref = (s: LinkableSite) =>
  `/heritage/${s.province_slug}/${s.slug}`;

export const siteGalleryHref = (s: LinkableSite) =>
  `/heritage/${s.province_slug}/${s.slug}/gallery`;

export const sitePhotoStoryHref = (s: LinkableSite) =>
  `/heritage/${s.province_slug}/${s.slug}/photo-story`;
