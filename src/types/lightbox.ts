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
  tagline?: string | null; // // ADD THIS LINE
};

/**
 * The universal, consistent data shape for any photo
 * that will be displayed in the lightbox.
 */
export type LightboxPhoto = {
  id: string; // Unique ID of the photo itself (e.g., review_photos.id or site_images.id)
  url: string;
  caption: string | null;
  author: LightboxAuthor;
  site: LightboxSite;
  isBookmarked?: boolean;
  storagePath: string; // Needed for bookmarking/collection actions
  metadata?: {
    [key: string]: string | number;
  };
};
