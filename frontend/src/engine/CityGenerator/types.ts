// engine/CityGenerator/types.ts
// Type definitions for city generation

export interface DistrictPosition {
    x: number
    y: number
    width: number
    height: number
    rotation: number
}

export interface BuildingPosition {
    x: number
    y: number
    width: number
    height: number
    floors: number
}

export interface RoomPosition {
    x: number
    y: number
    width: number
    height: number
    floor: number
}

export interface CityBounds {
    width: number
    height: number
    centerX: number
    centerY: number
}

export type DistrictLayoutStrategy = 'radial' | 'grid' | 'organic' | 'linear'
export type BuildingLayoutStrategy = 'grid' | 'packed' | 'scattered' | 'street'
