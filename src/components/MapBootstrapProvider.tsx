"use client";

import React, { createContext, useContext } from "react";
import type { MapBootstrap } from "@/lib/mapBootstrap";

const MapBootstrapContext = createContext<MapBootstrap | null>(null);

export function MapBootstrapProvider({
  initialBootstrap,
  children,
}: {
  initialBootstrap: MapBootstrap | null;
  children: React.ReactNode;
}) {
  return (
    <MapBootstrapContext.Provider value={initialBootstrap}>
      {children}
    </MapBootstrapContext.Provider>
  );
}

export function useMapBootstrap(): MapBootstrap | null {
  return useContext(MapBootstrapContext);
}
