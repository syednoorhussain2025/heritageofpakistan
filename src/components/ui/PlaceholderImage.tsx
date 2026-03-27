// Generic placeholder shown when an image is unavailable or not yet loaded.
// Scales to fill its container — works at any size or aspect ratio.
// No network requests: everything is inline.

export default function PlaceholderImage({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{ background: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#c0c0c0"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: "30%", height: "30%" }}
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    </div>
  )
}

// Base64 data URI version — use as blurDataURL or img src fallback.
// Background #e8e8e8, icon #c0c0c0, 24×24 viewBox.
export const PLACEHOLDER_DATA_URL =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23c0c0c0" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" fill="%23e8e8e8" stroke="%23c0c0c0"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`
  )
