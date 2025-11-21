// src/components/loader-engine/SimpleLoader.tsx
export function SimpleLoader() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-white">
      <div
        className="h-12 w-12 rounded-full border-2 border-neutral-300 border-t-transparent animate-spin"
        style={{ animationDuration: "0.6s" }} // faster spin like your current version
      />
    </div>
  );
}
