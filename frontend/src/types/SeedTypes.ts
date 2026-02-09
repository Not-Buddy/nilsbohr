// types/SeedTypes.ts
// Updated to match the new flat backend response structure

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
  route_type: RouteType | string  // Accept both enum and legacy string
  bidirectional: boolean
  metadata?: Record<string, unknown> | null
}

// ----------- Parameters -------------

export interface Parameter {
  name: string
  datatype: string
}

// ----------- Artifacts -------------

export interface ArtifactSpec {
  id: string
  name: string
  artifact_type: string
  datatype: string
  is_mutable: boolean
  value_hint: string | null
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
  parameters: string
  return_type: string | null
  calls: string[]
}

export interface Room {
  kind: 'Room'
  spec: RoomSpec
  artifacts: Artifact[]
}

// ----------- Buildings -------------

export interface BuildingSpec {
  id: string
  name: string
  building_type: string
  is_public: boolean
  loc: number
  imports: string[]
}

export interface Building {
  kind: 'Building'
  spec: BuildingSpec
  rooms: Room[]
}

// ----------- Districts -------------

export interface DistrictSpec {
  id: string
  name: string
  path: string
}

export interface District {
  kind: 'District'
  spec: DistrictSpec
  buildings: Building[]
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
  entrypoint_id: string | null
  stats: CityStats
}

export interface City {
  kind: 'City'
  spec: CitySpec
  districts: District[]
}

// ----------- Main Response -------------

export interface ProjectResponse {
  project: ProjectMeta
  cities: City[]
  highways: Highway[]
}

// ----------- Legacy Compatibility (for sample.json) -------------
// These types are kept for compatibility with the old structure

export type GameEntity = City | District | Building | Room | Artifact

export interface EntityWrapper<TKind extends string, TSpec> {
  kind: TKind
  spec: TSpec
}

export interface Route {
  id?: string  // Optional for backwards compatibility
  from_id: string
  to_id: string
  route_type: RouteType | string
  bidirectional?: boolean
  metadata?: Record<string, unknown> | null
}

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
  highways: Route[]
  cities: City[]
}

export interface RootResponse {
  project_name: string
  generated_at: string
  seed: WorldSeed
}

// WorldResponse - matches Rust backend's WorldResponse struct
export interface WorldResponse {
  project_name: string
  generated_at: string
  seed: WorldSeed
}