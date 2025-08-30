// src/components/CollapsibleSidebar.tsx
"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import SearchFilters, { Filters } from "./SearchFilters";

export type Tool = {
  id: string;
  name: string;
  icon: string;
};

const ToolPanel = ({
  tool,
  onClose,
  filters,
  onFilterChange,
  onSearch,
}: {
  tool: Tool | undefined;
  onClose: () => void;
  filters?: Filters;
  onFilterChange?: (newFilters: Partial<Filters>) => void;
  onSearch?: () => void;
}) => {
  if (!tool) return null;

  return (
    <div className="h-full flex flex-col animate-fadeIn bg-white">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon name={tool.icon} size={24} className="text-gray-700" />
          <h2 className="font-panel-heading text-[var(--brand-blue)]">
            {tool.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-200"
        >
          <Icon name="times" size={20} className="text-gray-500" />
        </button>
      </div>
      <div className="flex-grow min-h-0">
        {tool.id === "search" && filters && onFilterChange && onSearch ? (
          <SearchFilters
            filters={filters}
            onFilterChange={onFilterChange}
            onSearch={onSearch}
          />
        ) : (
          <div className="p-4 text-gray-500">
            <p>Options for {tool.name} will be added here later.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default function CollapsibleSidebar({
  tools,
  filters,
  onFilterChange,
  onSearch,
}: {
  tools: Tool[];
  filters?: Filters;
  onFilterChange?: (newFilters: Partial<Filters>) => void;
  onSearch?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const handleToolClick = (toolId: string) => {
    if (isOpen && activeTool === toolId) {
      setIsOpen(false);
      setActiveTool(null);
    } else {
      setActiveTool(toolId);
      setIsOpen(true);
    }
  };

  const closePanel = () => {
    setIsOpen(false);
    setActiveTool(null);
  };

  const selectedTool = tools.find((t) => t.id === activeTool);

  return (
    <div
      className={`
        relative h-full flex flex-shrink-0
        bg-white border-r border-gray-200
        transition-all duration-300 ease-in-out
        ${isOpen ? "w-96" : "w-16 hover:w-56"}
        group
    `}
    >
      <div className="w-full h-full flex flex-col items-center py-4 space-y-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool.id)}
            title={tool.name}
            // UPDATED: Added 'cursor-pointer' class
            className={`flex items-center w-full h-12 rounded-lg transition-colors group/item cursor-pointer
                ${
                  activeTool === tool.id && isOpen
                    ? "text-white"
                    : "text-gray-500 hover:bg-gray-100 hover:text-[var(--brand-orange)]"
                }
            `}
          >
            <div
              className={`w-16 h-12 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors ${
                activeTool === tool.id && isOpen ? "bg-[var(--brand-blue)]" : ""
              }`}
            >
              <Icon name={tool.icon} size={20} />
            </div>
            <span className="font-sidebar-menu whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {tool.name}
            </span>
          </button>
        ))}
      </div>

      <div
        className={`absolute top-0 left-16 w-[calc(100%-4rem)] h-full transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {isOpen && (
          <ToolPanel
            tool={selectedTool}
            onClose={closePanel}
            filters={filters}
            onFilterChange={onFilterChange}
            onSearch={onSearch}
          />
        )}
      </div>
    </div>
  );
}
