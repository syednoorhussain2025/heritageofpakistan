/**
 * Represents the author of a photo.
 */
export type LightboxAuthor = {
  name: string;
  profileUrl?: string;
};

/**
 * Represents the core site information associated with a photo.
 */
export type LightboxSite = {
  id: string; // The site's UUID
  name: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  region: string;
  categories: string[];
  architecturalStyle?: string | null;
  tagline?: string | null; // ADD THIS LINE
};

/**
 * The universal, consistent data shape for any photo
 * that will be displayed in the lightbox.
 */
export type LightboxPhoto = {
  id: string; // Unique ID of the photo (e.g. site_images.id)
  url: string;
  caption: string | null;
  author: LightboxAuthor;
  site: LightboxSite;
  isBookmarked?: boolean;
  storagePath: string; // Needed for bookmarking/collection actions

  /**
   * Optional metadata container for future extensible fields.
   */
  metadata?: {
    [key: string]: string | number;
  };

  /**
   * --- PERFORMANCE FIELDS ---
   * These are injected from the database (site_images table)
   * and give major speed improvements for the gallery.
   */

  /** Intrinsic width of the image (px) — used for layout with no reflow */
  width?: number | null;

  /** Intrinsic height of the image (px) — used for layout with no reflow */
  height?: number | null;

  /** Encoded BlurHash string (e.g. "LKO2?U00D%M{...") */
  blurHash?: string | null;

  /** Base64 tiny preview (used by Next.js Image placeholder="blur") */
  blurDataURL?: string | null;
};
