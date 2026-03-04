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
  onOpenNearbyModal,
  onClearNearby,
  onReset,
  renderToolPanel,
}: {
  tool: Tool | undefined;
  onClose: () => void;
  filters?: Filters;
  onFilterChange?: (newFilters: Partial<Filters>) => void;
  onSearch?: () => void;
  onOpenNearbyModal?: () => void;
  onClearNearby?: () => void;
  onReset?: () => void;
  renderToolPanel?: (toolId: string, onClose: () => void) => React.ReactNode;
}) => {
  if (!tool) return null;

  const customContent = renderToolPanel?.(tool.id, onClose);
  if (customContent != null) {
    // When tool.name is empty (virtual tool like "site"), suppress the header —
    // the renderToolPanel content provides its own close button / header.
    const showHeader = Boolean(tool.name);
    return (
      <div className="h-full flex flex-col animate-fadeIn bg-white">
        {showHeader && (
          <div className="p-4 flex items-center justify-between shrink-0">
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
        )}
        <div className="flex-grow min-h-0 overflow-auto">{customContent}</div>
      </div>
    );
  }

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
            onSearch={() => { onSearch(); onClose(); }}
            onOpenNearbyModal={onOpenNearbyModal}
            onClearNearby={onClearNearby}
            onReset={onReset}
            hideHeading
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
  onOpenNearbyModal,
  onClearNearby,
  onReset,
  renderToolPanel,
  controlledOpenTool,
  onControlledToolClose,
}: {
  tools: Tool[];
  filters?: Filters;
  onFilterChange?: (newFilters: Partial<Filters>) => void;
  onSearch?: () => void;
  /** Opens the "Search Around a Site" modal (map/explore). */
  onOpenNearbyModal?: () => void;
  /** Called when the user clears the proximity (Search Around a Site) filter. */
  onClearNearby?: () => void;
  /** Called when the user clicks Reset in the search filters. */
  onReset?: () => void;
  renderToolPanel?: (toolId: string, onClose: () => void) => React.ReactNode;
  /** When set, forces the sidebar open to this tool ID (e.g. "site" for a map pin click). */
  controlledOpenTool?: string | null;
  /** Called when the user closes the panel while in controlled mode. */
  onControlledToolClose?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  // Controlled mode overrides internal state
  const effectiveIsOpen = controlledOpenTool != null ? true : isOpen;
  const effectiveActiveTool = controlledOpenTool ?? activeTool;

  const handleToolClick = (toolId: string) => {
    // Clicking a sidebar button always clears any controlled state first
    if (controlledOpenTool != null) onControlledToolClose?.();
    if (isOpen && activeTool === toolId) {
      setIsOpen(false);
      setActiveTool(null);
    } else {
      setActiveTool(toolId);
      setIsOpen(true);
    }
  };

  const closePanel = () => {
    if (controlledOpenTool != null) {
      onControlledToolClose?.();
    } else {
      setIsOpen(false);
      setActiveTool(null);
    }
  };

  // Find the active tool — fall back to a virtual stub for programmatic tools
  // (like "site") that aren't in the tools array.
  const selectedTool =
    tools.find((t) => t.id === effectiveActiveTool) ??
    (effectiveActiveTool
      ? ({ id: effectiveActiveTool, name: "", icon: "map-pin" } as Tool)
      : undefined);

  return (
    <div
      className={`
        relative h-full flex flex-shrink-0
        bg-white border-r border-gray-200
        transition-all duration-300 ease-in-out
        ${effectiveIsOpen ? "w-[440px]" : "w-16 hover:w-56"}
        group
    `}
    >
      <div className="w-full h-full flex flex-col items-center pt-14 pb-4 space-y-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool.id)}
            title={tool.name}
            className={`flex items-center w-full h-12 rounded-lg transition-colors group/item cursor-pointer
                ${
                  effectiveActiveTool === tool.id && effectiveIsOpen
                    ? "text-white"
                    : "text-[var(--brand-grey)] hover:bg-gray-100 hover:text-[var(--brand-orange)]"
                }
            `}
          >
            <div className="w-16 h-12 flex-shrink-0 flex items-center justify-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  effectiveActiveTool === tool.id && effectiveIsOpen
                    ? "bg-[var(--brand-blue)]"
                    : "bg-gray-100"
                }`}
              >
                <Icon name={tool.icon} size={20} />
              </div>
            </div>
            <span className="font-sidebar-menu whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {tool.name}
            </span>
          </button>
        ))}
      </div>

      <div
        className={`absolute top-0 left-16 w-[calc(100%-4rem)] h-full transition-opacity duration-300 ${
          effectiveIsOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {effectiveIsOpen && (
          <ToolPanel
            tool={selectedTool}
            onClose={closePanel}
            filters={filters}
            onFilterChange={onFilterChange}
            onSearch={onSearch}
            onOpenNearbyModal={onOpenNearbyModal}
            onClearNearby={onClearNearby}
            onReset={onReset}
            renderToolPanel={renderToolPanel}
          />
        )}
      </div>
    </div>
  );
}
