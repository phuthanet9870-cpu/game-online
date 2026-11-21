// Tile map + collision + line of sight. Pure data, server-portable.
export class TileMap {
  constructor(def) {
    this.id = def.map_id;
    this.name = def.name;
    this.tileSize = def.tileSize;
    this.width = def.width;
    this.height = def.height;
    this.pixelWidth = this.width * this.tileSize;
    this.pixelHeight = this.height * this.tileSize;
    this.tiles = [];
    this.solid = new Uint8Array(this.width * this.height);
    this.losBlock = new Uint8Array(this.width * this.height);
    this.playerSpawn = null;
    this.monsterAnchors = [];
    if (def.layout.length !== this.height) throw new Error(`map ${def.map_id}: layout has ${def.layout.length} rows, expected ${this.height}`);
    def.layout.forEach((row, y) => {
      if (row.length !== this.width) throw new Error(`map ${def.map_id}: row ${y} has width ${row.length}, expected ${this.width}`);
      for (let x = 0; x < this.width; x++) {
        const ch = row[x];
        const legend = def.legend[ch];
        if (!legend) throw new Error(`map ${def.map_id}: unknown tile '${ch}' at ${x},${y}`);
        const i = y * this.width + x;
        this.tiles[i] = legend.tile;
        this.solid[i] = legend.solid ? 1 : 0;
        this.losBlock[i] = legend.blocksLos ? 1 : 0;
        const cx = (x + 0.5) * this.tileSize, cy = (y + 0.5) * this.tileSize;
        if (legend.marker === 'player_spawn') this.playerSpawn = { x: cx, y: cy };
        if (legend.marker === 'monster_anchor') this.monsterAnchors.push({ x: cx, y: cy, monsterId: legend.monsterId });
      }
    });
    if (!this.playerSpawn) throw new Error(`map ${def.map_id}: no player spawn`);
  }
  tileAt(tx, ty) { return this.tiles[ty * this.width + tx]; }
  isSolidTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return true;
    return this.solid[ty * this.width + tx] === 1;
  }
  blocksLosTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return true;
    return this.losBlock[ty * this.width + tx] === 1;
  }
  isSolidAt(px, py) { return this.isSolidTile(Math.floor(px / this.tileSize), Math.floor(py / this.tileSize)); }
  /** Does an axis-aligned box of half-size r centred on (x,y) overlap any solid tile? */
  overlapsSolid(x, y, r) {
    const ts = this.tileSize, e = 1e-6;
    const x0 = Math.floor((x - r) / ts), x1 = Math.floor((x + r - e) / ts);
    const y0 = Math.floor((y - r) / ts), y1 = Math.floor((y + r - e) / ts);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolidTile(tx, ty)) return true;
    return false;
  }
  /**
   * Move a box by (dx,dy) with axis-separated sliding. Large moves are sub-stepped so
   * a fast dash can never tunnel through a 1-tile wall.
   */
  moveAndSlide(x, y, dx, dy, r) {
    const maxStep = Math.max(1, r * 0.5);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
    const sx = dx / steps, sy = dy / steps;
    let hitX = false, hitY = false;
    for (let i = 0; i < steps; i++) {
      if (!hitX && sx !== 0) { if (!this.overlapsSolid(x + sx, y, r)) x += sx; else hitX = true; }
      if (!hitY && sy !== 0) { if (!this.overlapsSolid(x, y + sy, r)) y += sy; else hitY = true; }
    }
    return { x, y, hitX, hitY };
  }
  /** Sampled line-of-sight test; water does not block LOS, walls/rocks/trees do. */
  hasLineOfSight(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / 3));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      if (this.blocksLosTile(Math.floor(px / this.tileSize), Math.floor(py / this.tileSize))) return false;
    }
    return true;
  }
}
