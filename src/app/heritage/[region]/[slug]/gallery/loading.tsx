// Intentionally empty — suppress the parent segment's loading skeleton.
// The detail page stays visible (underneath) while the gallery server component
// fetches. GalleryClient then slides in from the right on its own mount.
export default function GalleryLoading() {
  return null;
}
