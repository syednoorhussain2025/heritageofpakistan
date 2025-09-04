import React from "react";
import Link from "next/link";

// --- Types ---
// Re-defining the Site type here to make the component self-sufficient.
// Ensure this matches the type definition in your main page.
type Site = {
  id: string;
  slug: string;
  title: string;
};

// --- Props for our component ---
interface StickyHeaderProps {
  site: Site | null;
  isBookmarked: boolean;
  wishlisted: boolean;
  inTrip: boolean;
  mapsLink: string | null;
  isLoaded: boolean; // For bookmark loading state
  toggleBookmark: (id: string) => void;
  setShowWishlistModal: (show: boolean) => void;
  setInTrip: (inTrip: boolean | ((prev: boolean) => boolean)) => void;
  doShare: () => void;
  setShowReviewModal: (show: boolean) => void;
}

// --- Helper Components ---

function ActionButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { children, className, ...rest } = props;
  return (
    <button
      {...rest}
      className={`px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 font-button-action text-sm transition-all duration-200 ${
        className ?? ""
      }`}
    >
      {children}
    </button>
  );
}

// Inlined a placeholder for the Icon component to resolve import errors.
function Icon({
  name,
  size,
  className,
}: {
  name: string;
  size: number;
  className?: string;
}) {
  // A simple placeholder to render an icon-like element.
  const iconMap: { [key: string]: string } = {
    heart: "❤️",
  };
  return (
    <span className={className} style={{ fontSize: size }}>
      {iconMap[name] || "●"}
    </span>
  );
}

// --- Main Component ---

export default function StickyHeader({
  site,
  isBookmarked,
  wishlisted,
  inTrip,
  mapsLink,
  isLoaded,
  toggleBookmark,
  setShowWishlistModal,
  setInTrip,
  doShare,
  setShowReviewModal,
}: StickyHeaderProps) {
  // If there's no site data yet, render nothing.
  if (!site) {
    return null;
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md shadow-md animate-fade-in-down">
        <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 py-3 flex justify-between items-center">
          {/* Left Side: Site Title */}
          <h2 className="text-lg font-bold text-gray-800 truncate pr-4">
            {site.title}
          </h2>

          {/* Right Side: Action Buttons */}
          <div className="flex flex-wrap justify-end items-center gap-2 md:gap-3">
            {mapsLink && (
              <a
                href={mapsLink}
                target="_blank"
                className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 font-button-action text-sm transition-all duration-200"
              >
                Open Pin
              </a>
            )}
            <ActionButton
              onClick={() => toggleBookmark(site.id)}
              className={
                isBookmarked ? "text-red-500 border-red-200 bg-red-50" : ""
              }
            >
              <div className="flex items-center gap-1.5">
                <Icon name="heart" size={12} />
                <span>
                  {isLoaded
                    ? isBookmarked
                      ? "Bookmarked"
                      : "Bookmark"
                    : "Bookmark"}
                </span>
              </div>
            </ActionButton>

            <ActionButton onClick={() => setShowWishlistModal(true)}>
              {wishlisted ? "Wishlisted ✓" : "Add to Wishlist"}
            </ActionButton>

            <ActionButton onClick={() => setInTrip((t) => !t)}>
              {inTrip ? "Added to Trip ✓" : "Add to Trip"}
            </ActionButton>

            <a
              href={`/heritage/${site.slug}/gallery`}
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 font-button-action text-sm transition-all duration-200"
            >
              Photo Gallery
            </a>

            <ActionButton onClick={doShare}>Share</ActionButton>

            <a
              href="#reviews"
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 font-button-action text-sm transition-all duration-200"
            >
              Reviews
            </a>

            <ActionButton
              onClick={() => setShowReviewModal(true)}
              className="bg-black text-white hover:bg-gray-800"
            >
              Share Your Experience
            </ActionButton>
          </div>
        </div>
      </div>
      {/* CSS for the fade-in animation */}
      <style jsx global>{`
        @keyframes fade-in-down {
          0% {
            opacity: 0;
            transform: translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
