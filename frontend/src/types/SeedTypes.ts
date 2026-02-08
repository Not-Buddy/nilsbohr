import type { EntityWrapper } from "./Types";

export type GameEntity = City | District | Building | Room | Artifact;

export type ContainerEntity = City | District | Building | Room;

// ----------- Routes -------------

export interface Route {
  from_id: string
  to_id: string
  route_type: string 
}

// ----------- Artifacts -------------

export interface ArtifactSpec {
  id: 'Artifact'
  name: string
  artifact_type: string
  datatype: string
  is_mutable: boolean
  value_hint: string | null
}
export type Artifact = EntityWrapper<'Artifact', ArtifactSpec>


// ----------- Rooms and Buildings -------------

export interface Parameter {
  name: string
  datatype: string
}

export interface RoomSpec {
  id: 'Room'
  name: string
  room_type: string
  is_main: boolean
  is_async: boolean
  visibility: string
  complexity: number
  loc: number
  return_type: string | null
  parameters: Parameter[]
  calls: string[]
  children: GameEntity[]
}
export type Room = EntityWrapper<'Room', RoomSpec>


export interface BuildingSpec {
  id: 'Building'
  name: string
  building_type: string
  is_public: boolean
  loc: number
  imports: string[]
  children: GameEntity[]
}

export type Building = EntityWrapper<'Building', BuildingSpec>

// ----------- District -------------


export interface DistrictSpec {
  id: 'District'
  name: string
  path: string
  children: GameEntity[]
}

export type District = EntityWrapper<'District', DistrictSpec>

// ----------- Cities -------------

export interface CityStats {
  building_count: number
  room_count: number
  artifact_count: number
  loc : number
}

export interface CitySpec {
  id: 'City'
  name: string
  language: string
  theme: string
  entry_point_id: string | null
  stats: CityStats
  children: GameEntity[]
}

export type City = EntityWrapper<'City', CitySpec>

// ----------- World -------------


export interface WorldMeta {
  total_cities?: number
  //total_districts?: number
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

// ----------- Main Root -------------

export interface RootResponse {
  project_name: string
  generated_at: string
  seed: WorldSeed
}