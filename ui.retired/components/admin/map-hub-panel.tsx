"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Map, Network, Flag, Target, Layers, Droplets, Shield, AlertTriangle, Mountain, Globe, Volume2, Film, Zap, TrendingUp, Heart, Clapperboard } from "lucide-react"
import { MapManagerPanel } from "./map-manager-panel"
import { WorldMapPanel } from "./world-map-panel"
import { MapConnectionsPanel } from "./map-connections-panel"
import { RegionManagerPanel } from "./region-manager-panel"
import { SpawnManagerPanel } from "./spawn-manager-panel"
import { EntityManager } from "./entity-manager"

type MapTab = "maps" | "worldmap" | "connections" | "regions" | "spawns" | "spawn_waves" | "weather" | "rep_gates" | "hazards" | "terrain" | "sound_zones" | "tile_anims" | "world_events" | "economy" | "relationships" | "cutscenes"

const TABS: Array<{ id: MapTab; label: string; icon: React.ElementType }> = [
  { id: "worldmap",    label: "World Map",  icon: Globe },
  { id: "maps",        label: "Maps",      icon: Map },
  { id: "connections",  label: "Links",     icon: Network },
  { id: "regions",      label: "Regions",   icon: Flag },
  { id: "spawns",       label: "Spawns",    icon: Target },
  { id: "spawn_waves",  label: "Waves",     icon: Layers },
  { id: "weather",      label: "Weather",   icon: Droplets },
  { id: "rep_gates",    label: "Gates",     icon: Shield },
  { id: "hazards",      label: "Hazards",   icon: AlertTriangle },
  { id: "terrain",      label: "Terrain",    icon: Mountain },
  { id: "sound_zones",  label: "Sounds",     icon: Volume2 },
  { id: "tile_anims",   label: "Tile Anims", icon: Film },
  { id: "world_events", label: "Events",     icon: Zap },
  { id: "economy",      label: "Economy",    icon: TrendingUp },
  { id: "relationships", label: "NPC Bonds",  icon: Heart },
  { id: "cutscenes",    label: "Cutscenes",  icon: Clapperboard },
]

export function MapHubPanel() {
  const [tab, setTab] = useState<MapTab>("maps")

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0 overflow-x-auto">
        <Map className="w-5 h-5 text-primary mr-2 flex-shrink-0" />
        <h2 className="text-lg font-bold mr-3 flex-shrink-0">Maps & World</h2>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 whitespace-nowrap",
              tab === t.id
                ? "bg-primary/10 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "maps"        && <MapManagerPanel />}
        {tab === "worldmap"    && <WorldMapPanel onOpenMap={(id) => { setTab("maps") }} />}
        {tab === "connections"  && <MapConnectionsPanel />}
        {tab === "regions"      && <RegionManagerPanel />}
        {tab === "spawns"       && <SpawnManagerPanel />}
        {tab === "spawn_waves"  && <EntityManager section="spawn_waves" />}
        {tab === "weather"      && <EntityManager section="region_weather" />}
        {tab === "rep_gates"    && <EntityManager section="region_rep_gates" />}
        {tab === "hazards"      && <EntityManager section="map_hazards" />}
        {tab === "terrain"      && <EntityManager section="battle_terrains" />}
        {tab === "sound_zones"  && <EntityManager section="sound_zone" />}
        {tab === "tile_anims"   && <EntityManager section="tile_animation" />}
        {tab === "world_events" && <EntityManager section="world_event" />}
        {tab === "economy"      && <EntityManager section="economy_state" />}
        {tab === "relationships" && <EntityManager section="npc_relationship" />}
        {tab === "cutscenes"    && <EntityManager section="cutscene" />}
      </div>
    </div>
  )
}
