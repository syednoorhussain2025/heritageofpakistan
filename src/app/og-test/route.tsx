import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "white",
          fontSize: 64,
        }}
      >
        OG TEST WORKS
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
