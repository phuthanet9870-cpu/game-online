/**
 * Maps are data, not code: each map is a JSON file in games/world/data/maps.
 * `tiles` is an array of rows; each character is one cell, looked up in TILES.
 */
export interface MapFile {
  id: string;
  name: string;
  spawn: { x: number; y: number };
  tiles: string[];
}

export interface TileType {
  name: string;
  walkable: boolean;
  /** Ground colour the client paints for this cell. */
  color: number;
  /** What the client places on top of the cell, if anything. */
  prop?: "tree" | "rock" | "water";
}

export const TILES: Record<string, TileType> = {
  ".": { name: "grass", walkable: true, color: 0x6fae4f },
  ",": { name: "dirt", walkable: true, color: 0xb59a6a },
  "T": { name: "tree", walkable: false, color: 0x5f9a43, prop: "tree" },
  "R": { name: "rock", walkable: false, color: 0x6fae4f, prop: "rock" },
  "~": { name: "water", walkable: false, color: 0x3f7fbf, prop: "water" },
};

export class GameMap {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly spawn: { x: number; y: number };
  private readonly cells: string[];

  constructor(file: MapFile) {
    if (file.tiles.length === 0) throw new Error(`map ${file.id}: no tiles`);
    const width = file.tiles[0].length;
    file.tiles.forEach((row, y) => {
      if (row.length !== width) throw new Error(`map ${file.id}: row ${y} has ${row.length} cells, expected ${width}`);
      for (const ch of row) if (!TILES[ch]) throw new Error(`map ${file.id}: unknown tile '${ch}' in row ${y}`);
    });
    this.id = file.id;
    this.name = file.name;
    this.width = width;
    this.height = file.tiles.length;
    this.cells = file.tiles;
    this.spawn = file.spawn;
    if (!this.isWalkable(file.spawn.x, file.spawn.y)) throw new Error(`map ${file.id}: spawn is not walkable`);
  }

  inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(x: number, y: number): TileType | undefined {
    return this.inBounds(x, y) ? TILES[this.cells[y][x]] : undefined;
  }

  isWalkable(x: number, y: number): boolean {
    return this.tileAt(x, y)?.walkable ?? false;
  }
}
