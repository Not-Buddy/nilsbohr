// types/SeedTypes.ts
// Updated to match the new recursive backend response structure

// ----------- Project Meta -------------

export interface ProjectStats {
  total_cities: number
  total_buildings: number
  total_rooms: number
  total_artifacts: number
  dominant_language: string
  complexity_score: number
}

export interface ProjectMeta {
  name: string
  generated_at: string
  seed: string
  stats: ProjectStats
}

// ----------- Highways (Routes) -------------

export type RouteType =
  | 'FunctionCall'
  | 'Import'
  | 'Inheritance'
  | 'NetworkRequest'
  | 'TypeReference'

export interface Highway {
  id: string
  from_id: string
  to_id: string
  route_type: RouteType | string
  bidirectional: boolean
  metadata?: Record<string, unknown> | null
}

// ----------- Parameters -------------

export interface Parameter {
  name: string
  datatype: string
}

// ----------- Game Entity Union (for recursive children) -------------

export type GameEntity = City | District | Building | Room | Artifact

// ----------- Artifacts -------------

export interface ArtifactSpec {
  id: string
  name: string
  artifact_type: string
  datatype: string
  is_mutable: boolean
  value_hint: string | null
  metadata?: Record<string, string> | null
}

export interface Artifact {
  kind: 'Artifact'
  spec: ArtifactSpec
}

// ----------- Rooms -------------

export interface RoomSpec {
  id: string
  name: string
  room_type: string
  is_main: boolean
  is_async: boolean
  visibility: string
  complexity: number
  loc: number
  parameters: Parameter[] // Updated directly to strict type
  return_type: string | null
  calls: string[]
  children?: GameEntity[] // Recursive children
  metadata?: Record<string, string> | null
}

export interface Room {
  kind: 'Room'
  spec: RoomSpec
  // Legacy support removed: children are now in spec or handled recursively
}

// ----------- Buildings -------------

export interface BuildingSpec {
  id: string
  name: string
  building_type: string
  is_public: boolean
  loc: number
  imports: string[]
  children?: GameEntity[] // Recursive children
  metadata?: Record<string, string> | null
}

export interface Building {
  kind: 'Building'
  spec: BuildingSpec
  // Legacy support removed
}

// ----------- Districts -------------

export interface DistrictSpec {
  id: string
  name: string
  path: string
  children?: GameEntity[] // Recursive children
}

export interface District {
  kind: 'District'
  spec: DistrictSpec
  // Legacy support removed
}

// ----------- Cities -------------

export interface CityStats {
  building_count: number
  room_count: number
  artifact_count: number
  loc: number
}

export interface CitySpec {
  id: string
  name: string
  language: string
  theme: string
  entry_point_id: string | null // Fixed typo: entrypoint_id -> entry_point_id
  stats: CityStats
  children?: GameEntity[] // Recursive children
}

export interface City {
  kind: 'City'
  spec: CitySpec
  // Legacy support removed
}

// ----------- Main Response -------------

export interface ProjectResponse {
  project: ProjectMeta
  cities: City[]
  highways: Highway[]
}

// ----------- Compatibility Types (if needed) -------------

export interface WorldMeta {
  total_cities?: number
  total_buildings?: number
  total_rooms?: number
  total_artifacts?: number
  dominant_language?: string
  complexity_score?: number
}

export interface WorldSeed {
  world_meta: WorldMeta
  highways: Highway[] // Renamed from Route to Highway for consistency, but kept Route alias below
  cities: City[]
}

export type Route = Highway

// WorldResponse - matches Rust backend's WorldResponse struct
export interface WorldResponse {
  project_name: string
  generated_at: string
  seed: WorldSeed
}

// Alias for compatibility if needed elsewhere
export type RootResponse = WorldResponse