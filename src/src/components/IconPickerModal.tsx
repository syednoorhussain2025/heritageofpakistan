// src/components/IconPickerModal.tsx
"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

type IconRow = {
  name: string;
  svg_content: string;
};

export default function IconPickerModal({
  isOpen,
  onClose,
  onSelect,
  icons,
  currentIcon,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (iconName: string | null) => void;
  icons: IconRow[];
  currentIcon: string | null;
}) {
  if (!isOpen) return null;
  const [search, setSearch] = useState("");

  const filteredIcons = icons.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[70vh] flex flex-col border border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Select an Icon</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl font-bold"
          >
            &times;
          </button>
        </div>
        <div className="p-4 border-b border-gray-700">
          <input
            type="text"
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="p-4 overflow-y-auto">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
            <button
              onClick={() => onSelect(null)}
              className={`flex flex-col items-center justify-center aspect-square rounded-lg border-2 transition-colors ${
                currentIcon === null
                  ? "border-blue-500 bg-blue-500/20"
                  : "border-gray-600 hover:border-blue-500"
              }`}
            >
              <span className="text-3xl text-gray-500">×</span>
              <span className="text-xs text-gray-400 mt-1">None</span>
            </button>
            {filteredIcons.map((icon) => (
              <button
                key={icon.name}
                onClick={() => onSelect(icon.name)}
                className={`flex flex-col items-center justify-center aspect-square rounded-lg border-2 transition-colors p-1 ${
                  currentIcon === icon.name
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-gray-600 hover:border-blue-500"
                }`}
              >
                <Icon name={icon.name} size={32} className="text-gray-200" />
                <span className="text-xs text-gray-400 mt-2 truncate w-full">
                  {icon.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
