package realtime

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

type fakeStore struct {
	mu      sync.Mutex
	rewards map[string]store.Reward
	audits  []store.AuditEntry
	saves   int
	binds   []string
}

func (f *fakeStore) ApplyReward(_ context.Context, r store.Reward) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.rewards[r.TxID]; ok {
		return store.ErrAlreadyApplied
	}
	f.rewards[r.TxID] = r
	return nil
}
func (f *fakeStore) ConsumeItem(context.Context, string, int64, string, int, string) error {
	return nil
}
func (f *fakeStore) SaveState(context.Context, int64, string, float64, float64, int) error {
	f.mu.Lock()
	f.saves++
	f.mu.Unlock()
	return nil
}
func (f *fakeStore) Audit(_ context.Context, e store.AuditEntry) error {
	f.mu.Lock()
	f.audits = append(f.audits, e)
	f.mu.Unlock()
	return nil
}

func newTestHub(t *testing.T) (*Hub, *fakeStore, *Persister) {
	_, file, _, _ := runtime.Caller(0)
	c, err := content.Load(filepath.Join(filepath.Dir(file), "../../../game-data"))
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	fs := &fakeStore{rewards: map[string]store.Reward{}}
	p := NewPersister(log)
	go p.Run()
	h := NewHub(DefaultConfig(), c, fs, p, log)
	return h, fs, p
}

func join(t *testing.T, h *Hub, charID int64, role string) *Client {
	c := NewClient(func(string) {})
	err := h.join(JoinRequest{Account: &store.Account{ID: charID, Role: role}, Character: &store.Character{ID: charID, Name: "P" + string(rune('A'+charID)), Weapon: "sword", Level: 1, MapID: "DEV-TRAINING-01"},
		Items: []store.ItemStack{{TemplateID: "CON-001", Quantity: 1}}, Client: c})
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func drain(c *Client) []map[string]any {
	var out []map[string]any
	for {
		select {
		case b := <-c.send:
			var m map[string]any
			_ = json.Unmarshal(b, &m)
			out = append(out, m)
		default:
			return out
		}
	}
}

func TestReplayedInputSequenceIsIgnored(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	c := join(t, h, 1, "player")
	s := h.sessions["c1"]
	h.onMessage(s, clientMsg{T: "input", Seq: 5, Mv: []float64{1, 0}})
	h.onMessage(s, clientMsg{T: "input", Seq: 5, Mv: []float64{-1, 0}})
	h.onMessage(s, clientMsg{T: "input", Seq: 4, Mv: []float64{0, 1}})
	if s.move.X != 1 || s.lastSeq != 5 || h.Stats.InputsReplayed.Load() != 2 {
		t.Fatalf("move=%v seq=%d replays=%d", s.move, s.lastSeq, h.Stats.InputsReplayed.Load())
	}
	_ = c
}

func TestSpeedHackVectorIsClamped(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	join(t, h, 1, "player")
	s := h.sessions["c1"]
	h.onMessage(s, clientMsg{T: "input", Seq: 1, Mv: []float64{100, 100}})
	if l := s.move.Len(); l > 1.0001 {
		t.Fatalf("move len %v", l)
	}
}

func TestUnauthorizedGMCommandDeniedAndAudited(t *testing.T) {
	h, fs, p := newTestHub(t)
	c := join(t, h, 1, "player")
	drain(c)
	h.onMessage(h.sessions["c1"], clientMsg{T: "chat", Text: "/gmstefanonline"})
	msgs := drain(c)
	p.Close()
	denied := false
	for _, m := range msgs {
		if m["t"] == "sys" && strings.Contains(m["text"].(string), "Permission Denied") {
			denied = true
		}
		if m["t"] == "gm" {
			t.Fatal("player must never receive GM HUD")
		}
	}
	if !denied || len(fs.audits) != 1 || fs.audits[0].Result != "denied" {
		t.Fatalf("denied=%v audits=%+v", denied, fs.audits)
	}
}

func TestAuthorizedGMOpensHud(t *testing.T) {
	h, fs, p := newTestHub(t)
	c := join(t, h, 1, "owner")
	drain(c)
	h.onMessage(h.sessions["c1"], clientMsg{T: "chat", Text: "/gmstefanonline"})
	msgs := drain(c)
	p.Close()
	opened := false
	for _, m := range msgs {
		if m["t"] == "gm" && m["open"] == true {
			opened = true
		}
	}
	if !opened || len(fs.audits) != 1 || fs.audits[0].Result != "ok" {
		t.Fatalf("opened=%v audits=%+v", opened, fs.audits)
	}
}

func TestReconnectKeepsInMemoryStateAndKicksOldSocket(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	old := join(t, h, 1, "player")
	s := h.sessions["c1"]
	s.gold = 42
	h.World("DEV-TRAINING-01").Player("c1").Pos.X += 10
	x := h.World("DEV-TRAINING-01").Player("c1").Pos.X
	h.handle(leave{"c1", old})
	if h.World("DEV-TRAINING-01").Player("c1").Connected {
		t.Fatal("should be in grace")
	}
	join(t, h, 1, "player")
	if h.sessions["c1"].gold != 42 || h.World("DEV-TRAINING-01").Player("c1").Pos.X != x || !h.World("DEV-TRAINING-01").Player("c1").Connected {
		t.Fatal("state not preserved on reconnect")
	}
}

func TestGraceExpiryRemovesAndSaves(t *testing.T) {
	h, fs, p := newTestHub(t)
	c := join(t, h, 1, "player")
	h.handle(leave{"c1", c})
	for i := 0; i < int(h.cfg.GraceMs/33)+40; i++ {
		h.step(1000.0 / 30)
	}
	p.Close()
	if _, ok := h.sessions["c1"]; ok || h.HasSession("c1") {
		t.Fatal("session should be removed after grace")
	}
	if fs.saves == 0 {
		t.Fatal("state must be saved on removal")
	}
}

func TestKillRewardPersistsOncePerContributor(t *testing.T) {
	h, fs, p := newTestHub(t)
	join(t, h, 1, "player")
	pl := h.World("DEV-TRAINING-01").Player("c1")
	pl.GodMode = true
	m := h.World("DEV-TRAINING-01").Monsters[0]
	pl.Pos = m.Pos
	pl.Pos.X -= 20
	s := h.sessions["c1"]
	for i := 0; i < 3000 && m.Alive(); i++ {
		s.aim = &m.Pos
		s.actions = append(s.actions[:0], struct {
			Type string `json:"type"`
			Slot string `json:"slot,omitempty"`
		}{"attack", "basic"})
		h.step(1000.0 / 30)
	}
	p.Close()
	if m.Alive() {
		t.Fatal("monster not killed")
	}
	if len(fs.rewards) != 1 {
		t.Fatalf("rewards persisted = %d", len(fs.rewards))
	}
	for _, r := range fs.rewards {
		if r.CharID != 1 || r.XPDelta <= 0 || s.xp != r.XPDelta || r.GoldDelta != 0 {
			t.Fatalf("reward %+v session xp=%d gold=%d", r, s.xp, s.gold)
		}
	}
}

func TestLevelCurve(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	pr := h.c.Progression
	if LevelForXP(pr, 0) != 1 || LevelForXP(pr, pr.XPToNext(1)) != 2 || LevelForXP(pr, 1<<60) != pr.MaxLevel {
		t.Fatal("level curve")
	}
	start, next := LevelBounds(pr, 2)
	if start != pr.XPToNext(1) || next != start+pr.XPToNext(2) {
		t.Fatal("level bounds")
	}
}

func (f *fakeStore) BindPower(_ context.Context, _ string, _ int64, powerID, _ string, _ []byte) error {
	f.mu.Lock()
	f.binds = append(f.binds, "bind:"+powerID)
	f.mu.Unlock()
	return nil
}
func (f *fakeStore) UnbindPower(_ context.Context, _ string, _ int64, powerID string) error {
	f.mu.Lock()
	f.binds = append(f.binds, "destroy:"+powerID)
	f.mu.Unlock()
	return nil
}
func (f *fakeStore) SaveLoadout(context.Context, int64, string, []byte) error  { return nil }
func (f *fakeStore) SaveProficiency(context.Context, int64, string, int) error { return nil }
func (f *fakeStore) SaveHotbar(context.Context, int64, []byte) error           { return nil }
func (f *fakeStore) SaveAutoSettings(context.Context, int64, []byte) error     { return nil }
func (f *fakeStore) SetWeapon(context.Context, int64, string) error            { return nil }
func (f *fakeStore) Craft(context.Context, string, int64, []store.ItemStack, store.ItemStack) error {
	return nil
}
