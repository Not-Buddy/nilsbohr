// engine/SeededRandom.ts
// Deterministic pseudo-random number generator using Mulberry32

/**
 * A seeded pseudo-random number generator that produces deterministic
 * sequences. Given the same seed, it will always produce the same
 * sequence of numbers.
 */
export class SeededRandom {
    private state: number
    private readonly initialSeed: number

    /**
     * Create a new SeededRandom instance.
     * @param seed - A string or number to seed the generator
     */
    constructor(seed: string | number) {
        const numericSeed = typeof seed === 'string' ? this.hashString(seed) : seed
        
        // Ensure seed is a positive 32-bit integer
        this.initialSeed = Math.abs(numericSeed) >>> 0
        if (this.initialSeed === 0) this.initialSeed = 1
        
        // Initialize state
        this.state = this.initialSeed
    }

    /**
     * Generate the next random number between 0 (inclusive) and 1 (exclusive).
     * Uses the Mulberry32 algorithm.
     */
    next(): number {
        let t = this.state += 0x6D2B79F5
        t = Math.imul(t ^ t >>> 15, t | 1)
        t ^= t + Math.imul(t ^ t >>> 7, t | 61)
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }

    /**
     * Resets the generator back to its original seed.
     */
    reset(): void {
        this.state = this.initialSeed
    }

    /**
     * [NEW] Critical for Infinite Worlds.
     * Creates a NEW independent generator for a specific coordinate (x, y).
     * Uses the initial seed + coordinates so it doesn't depend on previous calls.
     */
    at(x: number, y: number): SeededRandom {
        // Spatial Hashing: Mix coordinates with the root seed
        // Using large primes to scatter bits prevents patterns in grid-like calls
        const h1 = Math.imul(x, 0x1B873593) 
        const h2 = Math.imul(y, 0xCC9E2D51)
        const combined = (this.initialSeed ^ h1 ^ h2) >>> 0
        
        return new SeededRandom(combined)
    }

    /**
     * Generate a random number in a range.
     * @param min - Minimum value (inclusive)
     * @param max - Maximum value (exclusive)
     */
    range(min: number, max: number): number {
        return min + this.next() * (max - min)
    }

    /**
     * Generate a random integer in a range.
     * @param min - Minimum value (inclusive)
     * @param max - Maximum value (inclusive)
     */
    rangeInt(min: number, max: number): number {
        return Math.floor(this.range(min, max + 1))
    }

    /**
     * Generate a random angle in radians (0 to 2π).
     */
    angle(): number {
        return this.next() * Math.PI * 2
    }

    /**
     * Pick a random item from an array.
     */
    pick<T>(array: T[]): T {
        return array[Math.floor(this.next() * array.length)]
    }

    /**
     * Shuffle an array in place using Fisher-Yates algorithm.
     */
    shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1))
            ;[array[i], array[j]] = [array[j], array[i]]
        }
        return array
    }

    /**
     * Generate a Gaussian (normal) distributed random number.
     * Uses Box-Muller transform.
     * @param mean - The mean of the distribution (default 0)
     * @param stdDev - The standard deviation (default 1)
     */
    gaussian(mean = 0, stdDev = 1): number {
        const u1 = this.next()
        const u2 = this.next()
        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
        return z0 * stdDev + mean
    }

    /**
     * Fork the generator to create a child with a derived seed based on CURRENT state.
     * Useful for sub-systems (e.g., "I am generating a chest, let me fork for the loot").
     * @param key - A key to derive the child seed from
     */
    fork(key: string): SeededRandom {
        return new SeededRandom(this.hashString(key + this.state.toString()))
    }

    /**
     * Hash a string to a 32-bit integer using DJB2 algorithm.
     */
    private hashString(str: string): number {
        let hash = 5381
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
        }
        return hash >>> 0
    }
}

/**
 * Create a seeded random generator from project metadata.
 * This ensures the same project always generates the same world.
 */
export function createWorldRng(projectName: string, generatedAt: string): SeededRandom {
    return new SeededRandom(projectName + '|' + generatedAt)
}