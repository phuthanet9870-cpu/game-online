// Package rbac is capability-based access control for staff actions (spec §19.3).
// Roles map to explicit capabilities; checks are always by capability, never by rank number.
package rbac

type Capability string

const (
	GMHudOpen      Capability = "gm.hud.open"
	PlayersView    Capability = "gm.players.view"
	PlayersKick    Capability = "gm.players.kick"
	GodModeTest    Capability = "gm.godmode.test"     // test/dev worlds only
	HealTest       Capability = "gm.heal.test"        // test/dev worlds only
	ItemsGrantTest Capability = "gm.items.grant.test" // reserved for Phase 3 (needs approval flow)
)

var roleCaps = map[string][]Capability{
	"player":        {},
	"helper":        {PlayersView},
	"moderator":     {GMHudOpen, PlayersView, PlayersKick},
	"gm":            {GMHudOpen, PlayersView, PlayersKick, GodModeTest, HealTest},
	"senior_gm":     {GMHudOpen, PlayersView, PlayersKick, GodModeTest, HealTest, ItemsGrantTest},
	"administrator": {GMHudOpen, PlayersView, PlayersKick, GodModeTest, HealTest, ItemsGrantTest},
	"owner":         {GMHudOpen, PlayersView, PlayersKick, GodModeTest, HealTest, ItemsGrantTest},
}

func ValidRole(r string) bool { _, ok := roleCaps[r]; return ok }

func Has(role string, c Capability) bool {
	for _, x := range roleCaps[role] {
		if x == c {
			return true
		}
	}
	return false
}

func Caps(role string) []Capability { return append([]Capability(nil), roleCaps[role]...) }
