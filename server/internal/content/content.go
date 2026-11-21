// Package content loads the shared data-driven game content from game-data/ (the same JSON the
// browser client bundles). The server is the authority; the client copy is for display/prediction.
package content

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
)

type StatusDef struct {
	ID                string  `json:"id"`
	DurationMs        float64 `json:"durationMs"`
	DefenseMultiplier float64 `json:"defenseMultiplier"`
}

type HitDef struct {
	AtMs        float64    `json:"atMs"`
	Shape       string     `json:"shape"`
	Radius      float64    `json:"radius"`
	ArcDeg      float64    `json:"arcDeg"`
	Modifier    float64    `json:"modifier"`
	Knockback   float64    `json:"knockback"`
	ApplyStatus *StatusDef `json:"applyStatus,omitempty"`
	Interrupt   bool       `json:"interrupt,omitempty"`
}

type CounterDef struct {
	StanceMs  float64 `json:"stanceMs"`
	Radius    float64 `json:"radius"`
	ArcDeg    float64 `json:"arcDeg"`
	Modifier  float64 `json:"modifier"`
	Knockback float64 `json:"knockback"`
}

type ActionDef struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Kind        string      `json:"kind"`
	CooldownMs  float64     `json:"cooldownMs"`
	StaminaCost float64     `json:"staminaCost"`
	WindupMs    float64     `json:"windupMs"`
	ActiveMs    float64     `json:"activeMs"`
	RecoveryMs  float64     `json:"recoveryMs"`
	Hits        []HitDef    `json:"hits,omitempty"`
	Counter     *CounterDef `json:"counter,omitempty"`
}

// Implemented reports whether the skill carries real numbers (vs. a name-only entry).
func (a ActionDef) Implemented() bool { return a.CooldownMs > 0 || a.Counter != nil || len(a.Hits) > 0 }

type WeaponDef struct {
	ID                string      `json:"id"`
	Name              string      `json:"name"`
	Role              string      `json:"role"`
	Implemented       bool        `json:"implemented"`
	WeaponCoefficient float64     `json:"weaponCoefficient"`
	BasicAttack       *ActionDef  `json:"basicAttack,omitempty"`
	Skills            []ActionDef `json:"skills"`
}

type MonsterDef struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Tier             string  `json:"tier"`
	Level            int     `json:"level"`
	Sprite           string  `json:"sprite"`
	MaxHp            float64 `json:"maxHp"`
	Attack           float64 `json:"attack"`
	Defense          float64 `json:"defense"`
	CritChance       float64 `json:"critChance"`
	MoveSpeed        float64 `json:"moveSpeed"`
	ChaseSpeed       float64 `json:"chaseSpeed"`
	Radius           float64 `json:"radius"`
	AggroRadius      float64 `json:"aggroRadius"`
	LeashRadius      float64 `json:"leashRadius"`
	AttackRange      float64 `json:"attackRange"`
	AttackWindupMs   float64 `json:"attackWindupMs"`
	AttackRecoveryMs float64 `json:"attackRecoveryMs"`
	AttackCooldownMs float64 `json:"attackCooldownMs"`
	AlertMs          float64 `json:"alertMs"`
	PatrolRadius     float64 `json:"patrolRadius"`
	RespawnMs        float64 `json:"respawnMs"`
	CorpseMs         float64 `json:"corpseMs"`
}

type PlayerBase struct {
	Level          int     `json:"level"`
	MaxHp          float64 `json:"maxHp"`
	Attack         float64 `json:"attack"`
	Defense        float64 `json:"defense"`
	CritChance     float64 `json:"critChance"`
	CritMultiplier float64 `json:"critMultiplier"`
	MoveSpeed      float64 `json:"moveSpeed"`
	Radius         float64 `json:"radius"`
	Stamina        struct {
		Max          float64 `json:"max"`
		RegenPerSec  float64 `json:"regenPerSec"`
		RegenDelayMs float64 `json:"regenDelayMs"`
	} `json:"stamina"`
	Dash struct {
		StaminaCost  float64 `json:"staminaCost"`
		Distance     float64 `json:"distance"`
		DurationMs   float64 `json:"durationMs"`
		CooldownMs   float64 `json:"cooldownMs"`
		Invulnerable bool    `json:"invulnerable"`
	} `json:"dash"`
	OutOfCombatMs             float64 `json:"outOfCombatMs"`
	OutOfCombatRegenPctPerSec float64 `json:"outOfCombatRegenPctPerSec"`
	RespawnDelayMs            float64 `json:"respawnDelayMs"`
	SpawnProtectionMs         float64 `json:"spawnProtectionMs"`
	DefenseK                  float64 `json:"defenseK"`
	MaxDamage                 float64 `json:"maxDamage"`
}

type ItemUse struct {
	HealPctMaxHp float64 `json:"healPctMaxHp"`
	CooldownMs   float64 `json:"cooldownMs"`
}

type ItemTemplate struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Category      string   `json:"category"`
	Rarity        string   `json:"rarity"`
	MaxStack      int      `json:"maxStack"`
	SellPriceGold int      `json:"sellPriceGold"`
	Tradable      bool     `json:"tradable"`
	GmOnly        bool     `json:"gmOnly"`
	Use           *ItemUse `json:"use,omitempty"`
}

type DropItem struct {
	ItemID string  `json:"itemId"`
	Chance float64 `json:"chance"`
	Min    int     `json:"min"`
	Max    int     `json:"max"`
}

type DropTable struct {
	ID        string     `json:"id"`
	MonsterID string     `json:"monsterId"`
	XP        int64      `json:"xp"`
	Gold      [2]int64   `json:"gold"`
	Items     []DropItem `json:"items"`
}

type Progression struct {
	MaxLevel int `json:"maxLevel"`
	XPCurve  struct {
		Base     float64 `json:"base"`
		Exponent float64 `json:"exponent"`
	} `json:"xpCurve"`
	PerLevel struct {
		MaxHp   float64 `json:"maxHp"`
		Attack  float64 `json:"attack"`
		Defense float64 `json:"defense"`
	} `json:"perLevel"`
	InventorySlots int `json:"inventorySlots"`
	StarterItems   []struct {
		ItemID   string `json:"itemId"`
		Quantity int    `json:"quantity"`
	} `json:"starterItems"`
	MaxCharactersPerAccount int `json:"maxCharactersPerAccount"`
}

// XPToNext returns the XP needed to go from level to level+1 ([TUNING] curve).
func (p Progression) XPToNext(level int) int64 {
	return int64(math.Round(p.XPCurve.Base * math.Pow(float64(level), p.XPCurve.Exponent)))
}

type MapData struct {
	MapID         string
	DisplayName   string
	Width, Height int
	TileSize      float64
	Collision     []uint8
	PlayerSpawn   [2]float64
	MonsterSpawns []MonsterSpawn
}

type MonsterSpawn struct {
	ID        string
	MonsterID string
	X, Y      float64
}

type Content struct {
	Weapons              []WeaponDef
	Monsters             map[string]*MonsterDef
	Player               PlayerBase
	Map                  *MapData
	Items                map[string]*ItemTemplate
	Drops                map[string]*DropTable // by monster id
	MinContributionShare float64
	Progression          Progression
}

func (c *Content) Weapon(id string) *WeaponDef {
	for i := range c.Weapons {
		if c.Weapons[i].ID == id {
			return &c.Weapons[i]
		}
	}
	return nil
}

func readJSON(dir, rel string, v any) error {
	b, err := os.ReadFile(filepath.Join(dir, rel))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(b, v); err != nil {
		return fmt.Errorf("%s: %w", rel, err)
	}
	return nil
}

type tiledMap struct {
	Width      int `json:"width"`
	Height     int `json:"height"`
	TileWidth  int `json:"tilewidth"`
	Properties []struct {
		Name  string `json:"name"`
		Value any    `json:"value"`
	} `json:"properties"`
	Layers []struct {
		Name    string `json:"name"`
		Data    []int  `json:"data"`
		Objects []struct {
			Name       string  `json:"name"`
			Type       string  `json:"type"`
			X          float64 `json:"x"`
			Y          float64 `json:"y"`
			Properties []struct {
				Name  string `json:"name"`
				Value any    `json:"value"`
			} `json:"properties"`
		} `json:"objects"`
	} `json:"layers"`
}

func parseMap(t tiledMap) (*MapData, error) {
	m := &MapData{Width: t.Width, Height: t.Height, TileSize: float64(t.TileWidth)}
	for _, p := range t.Properties {
		switch p.Name {
		case "mapId":
			m.MapID = fmt.Sprint(p.Value)
		case "displayName":
			m.DisplayName = fmt.Sprint(p.Value)
		}
	}
	foundSpawn := false
	for _, l := range t.Layers {
		switch l.Name {
		case "collision":
			m.Collision = make([]uint8, len(l.Data))
			for i, v := range l.Data {
				if v != 0 {
					m.Collision[i] = 1
				}
			}
		case "objects":
			for _, o := range l.Objects {
				switch o.Type {
				case "player_spawn":
					m.PlayerSpawn = [2]float64{o.X, o.Y}
					foundSpawn = true
				case "monster_spawn":
					s := MonsterSpawn{ID: o.Name, X: o.X, Y: o.Y}
					for _, p := range o.Properties {
						if p.Name == "monsterId" {
							s.MonsterID = fmt.Sprint(p.Value)
						}
					}
					m.MonsterSpawns = append(m.MonsterSpawns, s)
				}
			}
		}
	}
	if len(m.Collision) != m.Width*m.Height {
		return nil, fmt.Errorf("map collision size %d != %d", len(m.Collision), m.Width*m.Height)
	}
	if !foundSpawn {
		return nil, fmt.Errorf("map has no player_spawn")
	}
	return m, nil
}

// Load reads and validates all content under dir (the repository's game-data folder).
func Load(dir string) (*Content, error) {
	c := &Content{Monsters: map[string]*MonsterDef{}, Items: map[string]*ItemTemplate{}, Drops: map[string]*DropTable{}}
	var w struct {
		Weapons []WeaponDef `json:"weapons"`
	}
	if err := readJSON(dir, "weapons/weapons.json", &w); err != nil {
		return nil, err
	}
	c.Weapons = w.Weapons
	var ms struct {
		Monsters []MonsterDef `json:"monsters"`
	}
	if err := readJSON(dir, "monsters/phase1-monsters.json", &ms); err != nil {
		return nil, err
	}
	for i := range ms.Monsters {
		c.Monsters[ms.Monsters[i].ID] = &ms.Monsters[i]
	}
	if err := readJSON(dir, "weapons/player-base.json", &c.Player); err != nil {
		return nil, err
	}
	var tm tiledMap
	if err := readJSON(dir, "maps/training-ground.json", &tm); err != nil {
		return nil, err
	}
	m, err := parseMap(tm)
	if err != nil {
		return nil, err
	}
	c.Map = m
	var it struct {
		Items []ItemTemplate `json:"items"`
	}
	if err := readJSON(dir, "items/phase2-items.json", &it); err != nil {
		return nil, err
	}
	for i := range it.Items {
		c.Items[it.Items[i].ID] = &it.Items[i]
	}
	var dr struct {
		MinContributionShare float64     `json:"minContributionShare"`
		Tables               []DropTable `json:"tables"`
	}
	if err := readJSON(dir, "drops/phase2-drops.json", &dr); err != nil {
		return nil, err
	}
	c.MinContributionShare = dr.MinContributionShare
	for i := range dr.Tables {
		c.Drops[dr.Tables[i].MonsterID] = &dr.Tables[i]
	}
	if err := readJSON(dir, "progression/progression.json", &c.Progression); err != nil {
		return nil, err
	}
	if errs := c.Validate(); len(errs) > 0 {
		return nil, fmt.Errorf("content validation failed: %v", errs)
	}
	return c, nil
}

var lockedWeapons = []string{"staff", "sword", "dagger", "bow", "grimoire", "gauntlet"}

// Validate checks referential integrity and LOCKED counts.
func (c *Content) Validate() []string {
	var errs []string
	if len(c.Weapons) != 6 {
		errs = append(errs, fmt.Sprintf("expected 6 weapons, got %d", len(c.Weapons)))
	}
	for _, id := range lockedWeapons {
		w := c.Weapon(id)
		if w == nil {
			errs = append(errs, "missing weapon "+id)
			continue
		}
		if len(w.Skills) != 3 {
			errs = append(errs, fmt.Sprintf("%s has %d skills (must be 3)", id, len(w.Skills)))
		}
		if w.Implemented && w.BasicAttack == nil {
			errs = append(errs, id+" implemented without basicAttack")
		}
	}
	for _, s := range c.Map.MonsterSpawns {
		if c.Monsters[s.MonsterID] == nil {
			errs = append(errs, "spawn "+s.ID+" references unknown monster "+s.MonsterID)
		}
	}
	for mid, d := range c.Drops {
		if c.Monsters[mid] == nil {
			errs = append(errs, "drop table for unknown monster "+mid)
		}
		for _, di := range d.Items {
			if c.Items[di.ItemID] == nil {
				errs = append(errs, "drop "+d.ID+" references unknown item "+di.ItemID)
			}
		}
	}
	for _, s := range c.Progression.StarterItems {
		if c.Items[s.ItemID] == nil {
			errs = append(errs, "starter item unknown "+s.ItemID)
		}
	}
	return errs
}
