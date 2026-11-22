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

// StatusDef is both a registry entry (statuses.json) and an application (id + duration [+ overrides]).
type StatusDef struct {
	ID                    string  `json:"id"`
	DurationMs            float64 `json:"durationMs,omitempty"`
	DefenseMultiplier     float64 `json:"defenseMultiplier,omitempty"`
	SpeedMultiplier       float64 `json:"speedMultiplier,omitempty"`
	DamageTakenMultiplier float64 `json:"damageTakenMultiplier,omitempty"`
	Stun                  bool    `json:"stun,omitempty"`
	Root                  bool    `json:"root,omitempty"`
	Stealth               bool    `json:"stealth,omitempty"`
	ShieldPctMaxHp        float64 `json:"shieldPctMaxHp,omitempty"`
	EnergyRegenPerSec     float64 `json:"energyRegenPerSec,omitempty"`
	StaminaRegenPerSec    float64 `json:"staminaRegenPerSec,omitempty"`
	Dot                   *DotDef `json:"dot,omitempty"`
	AtMs                  float64 `json:"atMs,omitempty"` // for selfStatus entries
}

type DotDef struct {
	TickMs   float64 `json:"tickMs"`
	Modifier float64 `json:"modifier"`
}

// Merge returns the registry definition overlaid with the per-skill application values.
func (c *Content) Status(app StatusDef) StatusDef {
	base, ok := c.Statuses[app.ID]
	if !ok {
		return app
	}
	if app.DurationMs > 0 {
		base.DurationMs = app.DurationMs
	}
	if app.DefenseMultiplier > 0 {
		base.DefenseMultiplier = app.DefenseMultiplier
	}
	return base
}

type HitDef struct {
	AtMs        float64    `json:"atMs"`
	Shape       string     `json:"shape"` // arc | circle | projectile
	Radius      float64    `json:"radius"`
	ArcDeg      float64    `json:"arcDeg"`
	Modifier    float64    `json:"modifier"`
	Knockback   float64    `json:"knockback"`
	ApplyStatus *StatusDef `json:"applyStatus,omitempty"`
	Interrupt   bool       `json:"interrupt,omitempty"`
	Speed       float64    `json:"speed,omitempty"`
	Range       float64    `json:"range,omitempty"`
	Pierce      bool       `json:"pierce,omitempty"`
	AtAim       bool       `json:"atAim,omitempty"`
	BonusBehind float64    `json:"bonusBehind,omitempty"`
}

type MoveDef struct {
	AtMs       float64 `json:"atMs"`
	Type       string  `json:"type"` // dash | back | blink
	Distance   float64 `json:"distance"`
	DurationMs float64 `json:"durationMs"`
	IFrames    bool    `json:"iframes"`
	ToAim      bool    `json:"toAim,omitempty"` // dash stops just past the aim point
}

type CounterDef struct {
	StanceMs  float64 `json:"stanceMs"`
	Radius    float64 `json:"radius"`
	ArcDeg    float64 `json:"arcDeg"`
	Modifier  float64 `json:"modifier"`
	Knockback float64 `json:"knockback"`
}

type ActionDef struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Kind        string          `json:"kind"`
	Category    string          `json:"category,omitempty"` // power-active | power-ultimate | power-passive (powers only)
	CooldownMs  float64         `json:"cooldownMs"`
	StaminaCost float64         `json:"staminaCost"`
	EnergyCost  float64         `json:"energyCost,omitempty"`
	WindupMs    float64         `json:"windupMs"`
	ActiveMs    float64         `json:"activeMs"`
	RecoveryMs  float64         `json:"recoveryMs"`
	Hits        []HitDef        `json:"hits,omitempty"`
	Counter     *CounterDef     `json:"counter,omitempty"`
	Move        *MoveDef        `json:"move,omitempty"`
	SelfStatus  []StatusDef     `json:"selfStatus,omitempty"`
	Telegraph   bool            `json:"telegraph,omitempty"`
	Description string          `json:"description,omitempty"`
	ImplFlag    *bool           `json:"implemented,omitempty"`
	Effects     *PassiveEffects `json:"effects,omitempty"`
}

// Implemented reports whether the skill carries real numbers (vs. a name-only entry).
func (a ActionDef) Implemented() bool {
	if a.ImplFlag != nil {
		return *a.ImplFlag
	}
	return a.CooldownMs > 0 || a.Counter != nil || len(a.Hits) > 0
}

type PassiveEffects struct {
	PowerDamageMult     float64            `json:"powerDamageMult,omitempty"`
	DotMult             map[string]float64 `json:"dotMult,omitempty"`
	StatusDurationAddMs map[string]float64 `json:"statusDurationAddMs,omitempty"`
	StealthBonusMult    float64            `json:"stealthBonusMult,omitempty"`
	BackAttackMult      float64            `json:"backAttackMult,omitempty"`
}

type PowerDef struct {
	ID             string      `json:"id"`
	Name           string      `json:"name"`
	Type           string      `json:"type"`
	AllowedWeapons []string    `json:"allowedWeapons"`
	FruitItemID    string      `json:"fruitItemId"`
	Obtainable     bool        `json:"obtainable"`
	Active         []ActionDef `json:"active"`
	Ultimate       []ActionDef `json:"ultimate"`
	Passive        []ActionDef `json:"passive"`
}

func (p *PowerDef) AllowsWeapon(w string) bool {
	for _, x := range p.AllowedWeapons {
		if x == w {
			return true
		}
	}
	return false
}

// Skill finds a skill by id in any category.
func (p *PowerDef) Skill(id string) *ActionDef {
	for _, l := range [][]ActionDef{p.Active, p.Ultimate, p.Passive} {
		for i := range l {
			if l[i].ID == id {
				return &l[i]
			}
		}
	}
	return nil
}

type RankDef struct {
	Rank     int `json:"rank"`
	Points   int `json:"points"`
	Active   int `json:"active"`
	Ultimate int `json:"ultimate"`
	Passive  int `json:"passive"`
}

type PowerConfig struct {
	Energy struct {
		Max         float64 `json:"max"`
		RegenPerSec float64 `json:"regenPerSec"`
	} `json:"energy"`
	Proficiency struct {
		Ranks            []RankDef `json:"ranks"`
		PointsPerCast    int       `json:"pointsPerCast"`
		PointsPerHit     int       `json:"pointsPerHit"`
		MaxPointsPerCast int       `json:"maxPointsPerCast"`
	} `json:"proficiency"`
	Loadout struct {
		Active   int `json:"active"`
		Ultimate int `json:"ultimate"`
		Passive  int `json:"passive"`
	} `json:"loadout"`
	Powers []PowerDef `json:"powers"`
}

// RankFor returns the proficiency rank definition reached with the given points.
func (pc *PowerConfig) RankFor(points int) RankDef {
	r := pc.Proficiency.Ranks[0]
	for _, x := range pc.Proficiency.Ranks {
		if points >= x.Points {
			r = x
		}
	}
	return r
}

type Recipe struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	NPC      string `json:"npc,omitempty"`
	GoldCost int64  `json:"goldCost,omitempty"`
	Inputs   []struct {
		ItemID   string `json:"itemId"`
		Quantity int    `json:"quantity"`
	} `json:"inputs"`
	Output struct {
		ItemID   string `json:"itemId"`
		Quantity int    `json:"quantity"`
	} `json:"output"`
}

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
	Passive          bool    `json:"passive,omitempty"` // never aggroes/attacks (training dummy)
	NoLoot           bool    `json:"noLoot,omitempty"`
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
	WeaponType    string   `json:"weaponType,omitempty"`
	PowerID       string   `json:"powerId,omitempty"`
	Slot          string   `json:"slot,omitempty"` // weapon | helmet | chest | armguard | legs | boots
	LevelReq      int      `json:"levelReq,omitempty"`
	Stats         *Stats   `json:"stats,omitempty"`
	SourceMap     string   `json:"sourceMap,omitempty"`
}

type Stats struct {
	Attack  float64 `json:"attack,omitempty"`
	Defense float64 `json:"defense,omitempty"`
	MaxHp   float64 `json:"maxHp,omitempty"`
}

type MapLoot struct {
	MapID string     `json:"mapId"`
	Rolls int        `json:"rolls"`
	Items []DropItem `json:"items"`
}

type EnhanceLevel struct {
	To     int     `json:"to"`
	Gold   int64   `json:"gold"`
	Stones int     `json:"stones"`
	Chance float64 `json:"chance"`
}

type EnhanceConfig struct {
	MaxLevel        int            `json:"maxLevel"`
	StatPctPerLevel float64        `json:"statPctPerLevel"`
	Levels          []EnhanceLevel `json:"levels"`
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
	MaxCharactersPerAccount int               `json:"maxCharactersPerAccount"`
	StarterWeaponItems      map[string]string `json:"starterWeaponItems"`
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
	NPCs          []NPC
	Portals       []Portal
	Kind          string // city | farm | dev | dungeon | arena
	PvPPolicy     string
	Core          bool // counts toward the LOCKED 32 core maps
}

// Portal is a rectangle that moves a player to another map (server-validated).
type Portal struct {
	ID, Label, TargetMap string
	X, Y, W, H           float64
	TargetX, TargetY     float64
}

func (p Portal) Contains(x, y float64) bool {
	return x >= p.X && x <= p.X+p.W && y >= p.Y && y <= p.Y+p.H
}

type NPC struct {
	ID, Name string
	X, Y     float64
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
	Map                  *MapData // dev training map (kept for engine tests)
	Maps                 map[string]*MapData
	StartMap             string
	Items                map[string]*ItemTemplate
	Drops                map[string]*DropTable // by monster id
	MinContributionShare float64
	Progression          Progression
	Statuses             map[string]StatusDef
	Powers               *PowerConfig
	Recipes              map[string]*Recipe
	Shops                map[string][]ShopItem // npc id -> stock
	MapLoot              map[string]*MapLoot
	Enhance              EnhanceConfig
	Quests               []QuestDef
}

type QuestObjective struct {
	Type    string   `json:"type"` // kill | collect | talk
	Targets []string `json:"targets,omitempty"`
	ItemID  string   `json:"itemId,omitempty"`
	NPC     string   `json:"npc,omitempty"`
	Count   int      `json:"count"`
	Label   string   `json:"label"`
}

type QuestDef struct {
	ID          string           `json:"id"`
	Kind        string           `json:"kind"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	LevelReq    int              `json:"levelReq"`
	Requires    []string         `json:"requires"`
	Repeatable  bool             `json:"repeatable"`
	Giver       string           `json:"giver"`
	TurnIn      string           `json:"turnIn"`
	Objectives  []QuestObjective `json:"objectives"`
	Rewards     struct {
		XP    int64 `json:"xp"`
		Gold  int64 `json:"gold"`
		Items []struct {
			ItemID   string `json:"itemId"`
			Quantity int    `json:"quantity"`
		} `json:"items"`
	} `json:"rewards"`
}

func (c *Content) Quest(id string) *QuestDef {
	for i := range c.Quests {
		if c.Quests[i].ID == id {
			return &c.Quests[i]
		}
	}
	return nil
}

type ShopItem struct {
	ItemID string `json:"itemId"`
	Price  int64  `json:"price"`
}

func (c *Content) Power(id string) *PowerDef {
	for i := range c.Powers.Powers {
		if c.Powers.Powers[i].ID == id {
			return &c.Powers.Powers[i]
		}
	}
	return nil
}

// NPC finds an NPC by id on any map (first match).
func (c *Content) NPC(id string) *NPC {
	for _, m := range c.Maps {
		for i := range m.NPCs {
			if m.NPCs[i].ID == id {
				return &m.NPCs[i]
			}
		}
	}
	return nil
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
			Width      float64 `json:"width"`
			Height     float64 `json:"height"`
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
		case "kind":
			m.Kind = fmt.Sprint(p.Value)
		case "pvpPolicy":
			m.PvPPolicy = fmt.Sprint(p.Value)
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
				case "portal":
					pt := Portal{ID: o.Name, X: o.X, Y: o.Y, W: o.Width, H: o.Height}
					for _, p := range o.Properties {
						switch p.Name {
						case "targetMap":
							pt.TargetMap = fmt.Sprint(p.Value)
						case "label":
							pt.Label = fmt.Sprint(p.Value)
						case "targetX":
							pt.TargetX, _ = p.Value.(float64)
						case "targetY":
							pt.TargetY, _ = p.Value.(float64)
						}
					}
					m.Portals = append(m.Portals, pt)
				case "npc":
					n := NPC{X: o.X, Y: o.Y}
					for _, p := range o.Properties {
						switch p.Name {
						case "npcId":
							n.ID = fmt.Sprint(p.Value)
						case "displayName":
							n.Name = fmt.Sprint(p.Value)
						}
					}
					m.NPCs = append(m.NPCs, n)
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
	c := &Content{Monsters: map[string]*MonsterDef{}, Items: map[string]*ItemTemplate{}, Drops: map[string]*DropTable{},
		Statuses: map[string]StatusDef{}, Recipes: map[string]*Recipe{}}
	var sts struct {
		Statuses []StatusDef `json:"statuses"`
	}
	if err := readJSON(dir, "weapons/statuses.json", &sts); err != nil {
		return nil, err
	}
	for _, s := range sts.Statuses {
		c.Statuses[s.ID] = s
	}
	var shops struct {
		Shops []struct {
			NPC   string     `json:"npc"`
			Items []ShopItem `json:"items"`
		} `json:"shops"`
	}
	if err := readJSON(dir, "npcs/shops.json", &shops); err != nil {
		return nil, err
	}
	c.Shops = map[string][]ShopItem{}
	for _, sh := range shops.Shops {
		c.Shops[sh.NPC] = sh.Items
	}
	var qs struct {
		Quests []QuestDef `json:"quests"`
	}
	if err := readJSON(dir, "quests/quests.json", &qs); err != nil {
		return nil, err
	}
	c.Quests = qs.Quests
	c.Powers = &PowerConfig{}
	if err := readJSON(dir, "powers/powers.json", c.Powers); err != nil {
		return nil, err
	}
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
	var index struct {
		StartMap string `json:"startMap"`
		Maps     []struct {
			ID   string `json:"id"`
			File string `json:"file"`
			Core bool   `json:"core"`
			Kind string `json:"kind"`
		} `json:"maps"`
	}
	if err := readJSON(dir, "maps/maps.json", &index); err != nil {
		return nil, err
	}
	c.Maps = map[string]*MapData{}
	c.StartMap = index.StartMap
	for _, e := range index.Maps {
		var tm tiledMap
		if err := readJSON(dir, "maps/"+e.File, &tm); err != nil {
			return nil, err
		}
		m, err := parseMap(tm)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", e.File, err)
		}
		if m.MapID != e.ID {
			return nil, fmt.Errorf("%s: mapId %s != index id %s", e.File, m.MapID, e.ID)
		}
		m.Core = e.Core
		if m.Kind == "" {
			m.Kind = e.Kind
		}
		c.Maps[m.MapID] = m
	}
	c.Map = c.Maps["DEV-TRAINING-01"]
	if c.Map == nil || c.Maps[c.StartMap] == nil {
		return nil, fmt.Errorf("maps.json must include DEV-TRAINING-01 and the start map")
	}
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
		MinContributionShare float64       `json:"minContributionShare"`
		Tables               []DropTable   `json:"tables"`
		Recipes              []Recipe      `json:"recipes"`
		MapLoot              []MapLoot     `json:"mapLoot"`
		Enhancement          EnhanceConfig `json:"enhancement"`
	}
	if err := readJSON(dir, "drops/phase2-drops.json", &dr); err != nil {
		return nil, err
	}
	c.MinContributionShare = dr.MinContributionShare
	for i := range dr.Tables {
		c.Drops[dr.Tables[i].MonsterID] = &dr.Tables[i]
	}
	for i := range dr.Recipes {
		c.Recipes[dr.Recipes[i].ID] = &dr.Recipes[i]
	}
	c.MapLoot = map[string]*MapLoot{}
	for i := range dr.MapLoot {
		c.MapLoot[dr.MapLoot[i].MapID] = &dr.MapLoot[i]
	}
	c.Enhance = dr.Enhancement
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
	for _, id := range lockedWeapons {
		it := c.Items[c.Progression.StarterWeaponItems[id]]
		if it == nil || it.WeaponType != id {
			errs = append(errs, "starter weapon item missing for "+id)
		}
	}
	// LOCKED §2.4: every Power has exactly 15 Active + 5 Ultimate + 5 Passive, unique ids
	if len(c.Powers.Powers) < 6 {
		errs = append(errs, "expected at least 6 powers")
	}
	seen := map[string]bool{}
	for _, p := range c.Powers.Powers {
		if len(p.Active) != 15 || len(p.Ultimate) != 5 || len(p.Passive) != 5 {
			errs = append(errs, fmt.Sprintf("power %s has %d/%d/%d skills (must be 15/5/5)", p.ID, len(p.Active), len(p.Ultimate), len(p.Passive)))
		}
		if it := c.Items[p.FruitItemID]; it == nil || it.PowerID != p.ID {
			errs = append(errs, "fruit item missing for power "+p.ID)
		}
		for _, l := range [][]ActionDef{p.Active, p.Ultimate, p.Passive} {
			for _, s := range l {
				if seen[s.ID] {
					errs = append(errs, "duplicate power skill "+s.ID)
				}
				seen[s.ID] = true
			}
		}
	}
	for npc, stock := range c.Shops {
		for _, it := range stock {
			t := c.Items[it.ItemID]
			if t == nil || t.GmOnly || it.Price <= int64(t.SellPriceGold) {
				errs = append(errs, "shop "+npc+": invalid item or price (must exceed sell price) "+it.ItemID)
			}
		}
	}
	for _, r := range c.Recipes {
		for _, in := range r.Inputs {
			if c.Items[in.ItemID] == nil {
				errs = append(errs, "recipe "+r.ID+" unknown input "+in.ItemID)
			}
		}
		if c.Items[r.Output.ItemID] == nil {
			errs = append(errs, "recipe "+r.ID+" unknown output")
		}
	}
	cities, farms := 0, 0
	for id, m := range c.Maps {
		if m.Core {
			switch m.Kind {
			case "city":
				cities++
			case "farm":
				farms++
			default:
				errs = append(errs, "core map "+id+" must be city or farm")
			}
		}
		for _, s := range m.MonsterSpawns {
			if c.Monsters[s.MonsterID] == nil {
				errs = append(errs, id+": spawn "+s.ID+" references unknown monster "+s.MonsterID)
			}
		}
		for _, pt := range m.Portals {
			t := c.Maps[pt.TargetMap]
			if t == nil {
				errs = append(errs, id+": portal "+pt.ID+" targets unknown map "+pt.TargetMap)
				continue
			}
			tx, ty := int(pt.TargetX/t.TileSize), int(pt.TargetY/t.TileSize)
			if tx < 0 || ty < 0 || tx >= t.Width || ty >= t.Height || t.Collision[ty*t.Width+tx] == 1 {
				errs = append(errs, id+": portal "+pt.ID+" lands inside a wall of "+t.MapID)
			}
		}
		for _, n := range m.NPCs {
			if n.ID == "" || m.Collision[int(n.Y/m.TileSize)*m.Width+int(n.X/m.TileSize)] == 1 {
				errs = append(errs, id+": npc "+n.Name+" invalid or inside a wall")
			}
		}
	}
	// LOCKED §2.9: at most 2 cities + 30 farms (exactly 32 by Phase 7)
	if cities > 2 || farms > 30 {
		errs = append(errs, fmt.Sprintf("core maps exceed 2 cities/30 farms: %d/%d", cities, farms))
	}
	for _, n := range c.Map.NPCs {
		if n.ID == "" || c.Map.Collision[int(n.Y/c.Map.TileSize)*c.Map.Width+int(n.X/c.Map.TileSize)] == 1 {
			errs = append(errs, "npc "+n.Name+" invalid or inside a wall")
		}
	}
	return errs
}
