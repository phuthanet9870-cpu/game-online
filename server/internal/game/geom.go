package game

import "math"

type Vec struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

func (a Vec) Sub(b Vec) Vec       { return Vec{a.X - b.X, a.Y - b.Y} }
func (a Vec) Add(b Vec) Vec       { return Vec{a.X + b.X, a.Y + b.Y} }
func (a Vec) Scale(s float64) Vec { return Vec{a.X * s, a.Y * s} }
func (a Vec) Len() float64        { return math.Hypot(a.X, a.Y) }
func Dist(a, b Vec) float64       { return math.Hypot(a.X-b.X, a.Y-b.Y) }
func (a Vec) IsZero() bool        { return math.Abs(a.X) < 1e-9 && math.Abs(a.Y) < 1e-9 }
func (a Vec) Normalize() Vec {
	l := a.Len()
	if l < 1e-9 {
		return Vec{}
	}
	return Vec{a.X / l, a.Y / l}
}

// ClampUnit limits a client-provided vector to length <= 1 (anti speed-hack: speed is server-side).
func ClampUnit(v Vec) Vec {
	if math.IsNaN(v.X) || math.IsNaN(v.Y) || math.IsInf(v.X, 0) || math.IsInf(v.Y, 0) {
		return Vec{}
	}
	if v.Len() > 1 {
		return v.Normalize()
	}
	return v
}

func AngleDiff(a, b float64) float64 {
	d := math.Mod(a-b, math.Pi*2)
	if d > math.Pi {
		d -= math.Pi * 2
	}
	if d <= -math.Pi {
		d += math.Pi * 2
	}
	return d
}

// Directions in the same order as the client's DIR8 (also sprite row order).
var Dir8 = []string{"S", "SE", "E", "NE", "N", "NW", "W", "SW"}

var dirVectors = map[string]Vec{
	"S": {0, 1}, "SE": {math.Sqrt2 / 2, math.Sqrt2 / 2}, "E": {1, 0}, "NE": {math.Sqrt2 / 2, -math.Sqrt2 / 2},
	"N": {0, -1}, "NW": {-math.Sqrt2 / 2, -math.Sqrt2 / 2}, "W": {-1, 0}, "SW": {-math.Sqrt2 / 2, math.Sqrt2 / 2},
}

func DirToAngle(d string) float64 {
	v := dirVectors[d]
	return math.Atan2(v.Y, v.X)
}

func VectorToDir8(v Vec, fallback string) string {
	if v.IsZero() {
		return fallback
	}
	oct := int(math.Round(math.Atan2(v.Y, v.X) / (math.Pi / 4)))
	switch oct {
	case 0:
		return "E"
	case 1:
		return "SE"
	case 2:
		return "S"
	case 3:
		return "SW"
	case 4, -4:
		return "W"
	case -3:
		return "NW"
	case -2:
		return "N"
	case -1:
		return "NE"
	}
	return fallback
}

// ArcHitsCircle mirrors the client's hitbox test (arc centred on facing, width arcDeg).
func ArcHitsCircle(origin Vec, facing, radius, arcDeg float64, target Vec, targetRadius float64) bool {
	dx, dy := target.X-origin.X, target.Y-origin.Y
	d := math.Hypot(dx, dy)
	if d > radius+targetRadius {
		return false
	}
	if d <= targetRadius {
		return true
	}
	half := arcDeg * math.Pi / 360
	pad := math.Asin(math.Min(1, targetRadius/d))
	return math.Abs(AngleDiff(math.Atan2(dy, dx), facing)) <= half+pad
}

// Grid is the tile collision map. Out of bounds is solid.
type Grid struct {
	W, H     int
	TileSize float64
	solid    []uint8
}

func NewGrid(w, h int, ts float64, solid []uint8) *Grid {
	return &Grid{W: w, H: h, TileSize: ts, solid: solid}
}

func (g *Grid) PixelW() float64 { return float64(g.W) * g.TileSize }
func (g *Grid) PixelH() float64 { return float64(g.H) * g.TileSize }

func (g *Grid) SolidTile(tx, ty int) bool {
	if tx < 0 || ty < 0 || tx >= g.W || ty >= g.H {
		return true
	}
	return g.solid[ty*g.W+tx] == 1
}

func (g *Grid) BoxCollides(cx, cy, half float64) bool {
	ts := g.TileSize
	x0 := int(math.Floor((cx - half) / ts))
	x1 := int(math.Floor((cx + half - 1e-6) / ts))
	y0 := int(math.Floor((cy - half) / ts))
	y1 := int(math.Floor((cy + half - 1e-6) / ts))
	for ty := y0; ty <= y1; ty++ {
		for tx := x0; tx <= x1; tx++ {
			if g.SolidTile(tx, ty) {
				return true
			}
		}
	}
	return false
}

func (g *Grid) LineOfSight(a, b Vec) bool {
	d := Dist(a, b)
	steps := int(math.Max(1, math.Ceil(d/(g.TileSize/2))))
	for i := 1; i < steps; i++ {
		t := float64(i) / float64(steps)
		x := a.X + (b.X-a.X)*t
		y := a.Y + (b.Y-a.Y)*t
		if g.SolidTile(int(math.Floor(x/g.TileSize)), int(math.Floor(y/g.TileSize))) {
			return false
		}
	}
	return true
}

// MoveWithCollision is the same axis-separated, sub-stepped algorithm as the client.
func (g *Grid) MoveWithCollision(pos, delta Vec, half float64) (Vec, bool, bool) {
	maxStep := g.TileSize / 4
	steps := int(math.Max(1, math.Ceil(math.Max(math.Abs(delta.X), math.Abs(delta.Y))/maxStep)))
	sx, sy := delta.X/float64(steps), delta.Y/float64(steps)
	x, y := pos.X, pos.Y
	bx, by := false, false
	for i := 0; i < steps; i++ {
		if !bx && sx != 0 {
			if g.BoxCollides(x+sx, y, half) {
				bx = true
			} else {
				x += sx
			}
		}
		if !by && sy != 0 {
			if g.BoxCollides(x, y+sy, half) {
				by = true
			} else {
				y += sy
			}
		}
	}
	return Vec{x, y}, bx, by
}

// Rng is mulberry32, identical to the client's createRng.
type Rng struct{ a uint32 }

func NewRng(seed uint32) *Rng { return &Rng{a: seed} }

func (r *Rng) Next() float64 {
	r.a += 0x6d2b79f5
	t := r.a
	t = (t ^ (t >> 15)) * (t | 1)
	t ^= t + (t^(t>>7))*(t|61)
	return float64(t^(t>>14)) / 4294967296
}

func (r *Rng) Range(min, max float64) float64 { return min + (max-min)*r.Next() }

// IntRange returns an integer in [min, max].
func (r *Rng) IntRange(min, max int64) int64 {
	if max <= min {
		return min
	}
	return min + int64(math.Floor(r.Next()*float64(max-min+1)))
}

// Damage pipeline (spec §5.2) — same order and formula as the client.
type DamageInput struct {
	Base, WeaponCoef, StatScaling, SkillMod float64
	TargetDefense, DefenseMul               float64
	CritChance, CritMul                     float64
	PvP                                     bool
	Absorb                                  float64
}

type DamageResult struct {
	Amount     int
	IsCrit     bool
	Mitigation float64
}

const pvpModifier = 0.6 // [TUNING]

func ComputeDamage(in DamageInput, rng *Rng, defenseK, maxDamage float64) DamageResult {
	raw := math.Max(0, in.Base) * in.WeaponCoef * in.StatScaling * in.SkillMod
	def := math.Max(0, in.TargetDefense*in.DefenseMul)
	mit := def / (def + defenseK)
	v := raw * (1 - mit)
	crit := rng.Next() < math.Min(1, math.Max(0, in.CritChance))
	if crit {
		v *= in.CritMul
	}
	if in.PvP {
		v *= pvpModifier
	}
	rounded := math.Round(v)
	absorbed := math.Min(math.Max(0, in.Absorb), rounded)
	minHit := 0.0
	if raw > 0 {
		minHit = 1
	}
	amt := math.Min(maxDamage, math.Max(minHit, rounded-absorbed))
	return DamageResult{Amount: int(amt), IsCrit: crit, Mitigation: mit}
}
