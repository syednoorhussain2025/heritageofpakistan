"use client";
import { useEffect } from "react";

export default function TestPage() {
  useEffect(() => {
    document.body.dataset.page = "test";
    return () => { delete document.body.dataset.page; };
  }, []);

  return (
    <>
      <style jsx global>{`
        html:has(body[data-page="test"]),
        body[data-page="test"] {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          position: fixed !important;
          background: red !important;
        }
      `}</style>
      <div style={{
        position: "fixed",
        inset: 0,
        background: "red",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: "24px",
        fontWeight: "bold",
      }}>
        FULL SCREEN TEST
      </div>
    </>
  );
}
