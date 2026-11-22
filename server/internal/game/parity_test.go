package game

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
)

// Parity fixtures: the same scripted scenario must produce the same event stream in the Go server
// engine and the TypeScript offline engine (apps/web-game/tests/unit/parity.test.ts).
// Regenerate with: UPDATE_PARITY=1 go test ./internal/game -run TestParity

type parityStep struct {
	Step    int             `json:"step"`
	Move    [2]float64      `json:"move"`
	Aim     *[2]float64     `json:"aim,omitempty"`
	Actions []ActionRequest `json:"actions,omitempty"`
}

type parityScenario struct {
	Name    string       `json:"name"`
	Seed    uint32       `json:"seed"`
	Weapon  string       `json:"weapon"`
	Power   string       `json:"power,omitempty"`
	Points  int          `json:"points,omitempty"`
	Spawns  [][3]any     `json:"spawns"` // [id, monsterId, [tx,ty]]
	Steps   int          `json:"steps"`
	DtMs    float64      `json:"dtMs"`
	Inputs  []parityStep `json:"inputs"`
	Events  []string     `json:"events"`
}

func recordEvent(e Event) (string, bool) {
	r3 := func(f float64) string { return fmt.Sprintf("%.3f", math.Round(f*1000)/1000) }
	switch e.Type {
	case "damage":
		return fmt.Sprintf("%s damage %s->%s %d %v %s", r3(e.Time), e.SourceID, e.TargetID, e.Amount, e.IsCrit, e.ActionID), true
	case "death", "respawn":
		return fmt.Sprintf("%s %s %s", r3(e.Time), e.Type, e.EntityID), true
	case "status":
		return fmt.Sprintf("%s status %s %s", r3(e.Time), e.TargetID, e.StatusID), true
	case "rejected":
		return fmt.Sprintf("%s rejected %s %s", r3(e.Time), e.Action, e.Reason), true
	case "ai-state":
		return fmt.Sprintf("%s ai %s %v->%s", r3(e.Time), e.EntityID, e.From, e.To), true
	}
	return "", false
}

func parityScenarios() []parityScenario {
	aim := func(x, y float64) *[2]float64 { return &[2]float64{x, y} }
	slime := [3]any{"s1", "MON-SLIME-001", [2]int{6, 6}}
	wolf := [3]any{"w1", "MON-WOLF-001", [2]int{8, 7}}
	var sword []parityStep
	for i := 0; i < 30; i++ {
		sword = append(sword, parityStep{Step: i, Move: [2]float64{1, 0}})
	}
	at := func(step int, a ...ActionRequest) parityStep {
		return parityStep{Step: step, Aim: aim(6*16+8, 6*16+8), Actions: a}
	}
	sword = append(sword, at(40, ActionRequest{Type: "attack", Slot: "basic"}), at(60, ActionRequest{Type: "attack", Slot: "skill1"}),
		at(90, ActionRequest{Type: "attack", Slot: "skill2"}), at(120, ActionRequest{Type: "attack", Slot: "basic"}),
		at(150, ActionRequest{Type: "attack", Slot: "skill3"}), at(200, ActionRequest{Type: "attack", Slot: "basic"}),
		parityStep{Step: 230, Move: [2]float64{0, 1}, Actions: []ActionRequest{{Type: "dash"}}}, parityStep{Step: 240})
	for s := 260; s < 600; s += 25 {
		sword = append(sword, parityStep{Step: s, Aim: aim(8*16+8, 7*16+8), Actions: []ActionRequest{{Type: "attack", Slot: "basic"}}})
	}
	var bow []parityStep
	for s := 10; s < 500; s += 20 {
		slot := []string{"basic", "skill1", "basic", "skill2", "basic", "skill3"}[(s/20)%6]
		bow = append(bow, parityStep{Step: s, Aim: aim(8*16+8, 7*16+8), Actions: []ActionRequest{{Type: "attack", Slot: slot}}})
	}
	var inferno []parityStep
	inferno = append(inferno, parityStep{Step: 5, Actions: []ActionRequest{{Type: "stance"}}})
	for s := 20; s < 600; s += 18 {
		slot := []string{"p1", "p2", "p4", "p5", "ult", "p3", "skill1"}[(s/18)%7]
		t := "power"
		if slot == "skill1" {
			t = "attack"
		}
		inferno = append(inferno, parityStep{Step: s, Aim: aim(6*16+8, 6*16+8), Actions: []ActionRequest{{Type: t, Slot: slot}}})
	}
	return []parityScenario{
		{Name: "sword-vs-slime-wolf", Seed: 7, Weapon: "sword", Spawns: [][3]any{slime, wolf}, Steps: 600, DtMs: 1000.0 / 30, Inputs: sword},
		{Name: "bow-projectiles", Seed: 11, Weapon: "bow", Spawns: [][3]any{wolf, {"d1", "MON-DUMMY-001", [2]int{9, 7}}}, Steps: 500, DtMs: 1000.0 / 30, Inputs: bow},
		{Name: "inferno-staff-burn-meteor", Seed: 23, Weapon: "staff", Power: "inferno", Points: 200, Spawns: [][3]any{slime, {"d1", "MON-DUMMY-001", [2]int{7, 6}}}, Steps: 600, DtMs: 1000.0 / 30, Inputs: inferno},
	}
}

func runParity(t *testing.T, sc parityScenario) []string {
	var spawns []content.MonsterSpawn
	for _, s := range sc.Spawns {
		tile := s[2].([2]int)
		spawns = append(spawns, at(s[0].(string), s[1].(string), tile[0], tile[1]))
	}
	w := arena(t, spawns...)
	w.Rng = NewRng(sc.Seed)
	p := w.AddPlayer(PlayerInit{ID: "player", Name: "P", WeaponID: sc.Weapon, Level: 1})
	p.InvulnerableUntil, p.SpawnProtectedUntil = 0, 0 // the TS sandbox has no join protection
	if sc.Power != "" {
		w.BindPower(p, w.C.Power(sc.Power), sc.Points, Loadout{})
	}
	byStep := map[int]parityStep{}
	for _, in := range sc.Inputs {
		byStep[in.Step] = in
	}
	var out []string
	move := Vec{}
	for i := 0; i < sc.Steps; i++ {
		in := Input{Move: move}
		if st, ok := byStep[i]; ok {
			move = Vec{st.Move[0], st.Move[1]}
			in.Move = move
			if st.Aim != nil {
				in.Aim = &Vec{st.Aim[0], st.Aim[1]}
			}
			in.Actions = st.Actions
		}
		w.Step(sc.DtMs, map[string]Input{"player": in})
		for _, e := range w.DrainEvents() {
			if s, ok := recordEvent(e); ok {
				out = append(out, s)
			}
		}
	}
	return out
}

func TestParityFixtures(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	dir := filepath.Join(filepath.Dir(file), "../../../tests/parity")
	for _, sc := range parityScenarios() {
		got := runParity(t, sc)
		path := filepath.Join(dir, sc.Name+".json")
		if os.Getenv("UPDATE_PARITY") == "1" {
			sc.Events = got
			b, _ := json.MarshalIndent(sc, "", " ")
			if err := os.WriteFile(path, b, 0o644); err != nil {
				t.Fatal(err)
			}
			continue
		}
		b, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("missing fixture %s (run with UPDATE_PARITY=1)", path)
		}
		var want parityScenario
		_ = json.Unmarshal(b, &want)
		if len(want.Events) != len(got) {
			t.Fatalf("%s: %d events, fixture has %d", sc.Name, len(got), len(want.Events))
		}
		for i := range got {
			if got[i] != want.Events[i] {
				t.Fatalf("%s: event %d differs\n got  %s\n want %s", sc.Name, i, got[i], want.Events[i])
			}
		}
	}
}
