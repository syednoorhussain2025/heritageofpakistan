// src/app/admin/layouts/page.tsx
"use client";

import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";

const Card = ({
  href,
  title,
  desc,
  icon = "admin",
}: {
  href: string;
  title: string;
  desc: string;
  icon?: string;
}) => (
  <Link
    href={href}
    className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
  >
    <div className="flex items-start gap-3">
      <span
        className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full"
        style={{ backgroundColor: "#00b78b" }}
      >
        <Icon name={icon} size={18} style={{ color: "#fff" }} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-slate-900">
          {title}
        </div>
        <div className="mt-0.5 text-sm leading-5 text-slate-600">{desc}</div>
      </div>
    </div>
  </Link>
);

export default function LayoutsHub() {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-100/70 text-slate-800">
        <main className="mx-auto max-w-5xl py-10 px-4 sm:px-6 lg:px-8">
          <h1
            className="mb-6 flex items-center gap-3 text-3xl font-bold"
            style={{ color: "var(--brand-blue)" }}
          >
            <Icon
              name="admin"
              size={48}
              style={{ color: "var(--brand-blue)" }}
            />
            Layouts & Templates
          </h1>

          <p className="mb-6 text-slate-700">
            Build and manage the visual building blocks used to format article
            sections. Create <strong>Section Types</strong>, assemble them into{" "}
            <strong>Templates</strong>, then pick a template per article part in
            the “Article” tab.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card
              href="/admin/layouts/sections"
              title="Section Builder"
              desc="Define section blocks (text & images), word targets, and CSS hooks."
              icon="categorytax"
            />
            <Card
              href="/admin/layouts/templates"
              title="Template Builder"
              desc="Stack sections vertically to form publishable templates."
              icon="listings"
            />
            {/* Optional: add more links later */}
            {/* <Card href="/admin/layouts/presets" title="Presets" desc="Manage code presets (optional)." /> */}
            {/* <Card href="/flow-playground" title="Flow Playground" desc="Test measuring/rendering." /> */}
          </div>

          <div className="mt-8">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              ← Back to Admin
            </Link>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}
