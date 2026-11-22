package realtime

import (
	"testing"
)

func lastOf(c *Client, t string) map[string]any {
	var last map[string]any
	for _, m := range drain(c) {
		if m["t"] == t {
			last = m
		}
	}
	return last
}

func TestPartyInviteAcceptKickLeaderAndChat(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	ca, a, _ := joinWith(t, h, 1, "player", "sword", nil)
	cb, b, _ := joinWith(t, h, 2, "player", "sword", nil)
	cc, c, _ := joinWith(t, h, 3, "player", "sword", nil)
	drain(ca)
	drain(cb)
	drain(cc)
	h.onMessage(a, clientMsg{T: "party", Op: "invite", Target: b.name})
	if lastOf(cb, "party")["invite"] == nil {
		t.Fatal("invitee should see the invite")
	}
	h.onMessage(b, clientMsg{T: "party", Op: "accept"})
	pt := h.partyOfSession(a)
	if pt == nil || pt.leader != 1 || len(pt.members) != 2 || h.partyOfSession(b) != pt {
		t.Fatalf("party not formed: %+v", pt)
	}
	// a non-leader cannot invite or kick
	h.onMessage(b, clientMsg{T: "party", Op: "invite", Target: c.name})
	if _, ok := h.invites[3]; ok {
		t.Fatal("only the leader invites")
	}
	h.onMessage(b, clientMsg{T: "party", Op: "kick", Target: a.name})
	if len(pt.members) != 2 {
		t.Fatal("non-leader kick must fail")
	}
	// accept without an invite fails
	h.onMessage(c, clientMsg{T: "party", Op: "accept"})
	if h.partyOfSession(c) != nil {
		t.Fatal("accept without invite")
	}
	// party chat reaches members only
	drain(cc)
	h.onMessage(a, clientMsg{T: "party", Op: "chat", Text: "hello team"})
	if m := lastOf(cb, "chat"); m == nil || m["ch"] != "party" {
		t.Fatalf("party chat not delivered: %v", m)
	}
	if lastOf(cc, "chat") != nil {
		t.Fatal("outsider got party chat")
	}
	h.onMessage(a, clientMsg{T: "party", Op: "promote", Target: b.name})
	if pt.leader != 2 {
		t.Fatal("promote")
	}
	h.onMessage(b, clientMsg{T: "party", Op: "kick", Target: a.name})
	if h.partyOfSession(a) != nil || h.parties[pt.id] != nil {
		t.Fatal("kicking the last other member disbands the party")
	}
}

func TestPartyFinderListAndJoinAndMaxSize(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	var ss []*session
	for i := int64(1); i <= 5; i++ {
		_, s, _ := joinWith(t, h, i, "player", "sword", nil)
		ss = append(ss, s)
	}
	h.onMessage(ss[0], clientMsg{T: "party", Op: "list", Text: "ลงดัน Lv1"})
	pt := h.partyOfSession(ss[0])
	if pt == nil || !pt.listed || pt.note != "ลงดัน Lv1" {
		t.Fatalf("listing: %+v", pt)
	}
	for i := 1; i < 4; i++ {
		h.onMessage(ss[i], clientMsg{T: "party", Op: "join", Count: pt.id})
	}
	if len(pt.members) != 4 || pt.listed {
		t.Fatalf("party should be full and unlisted: %d %v", len(pt.members), pt.listed)
	}
	h.onMessage(ss[4], clientMsg{T: "party", Op: "join", Count: pt.id})
	if h.partyOfSession(ss[4]) != nil {
		t.Fatal("5th member must be refused")
	}
	h.onMessage(ss[1], clientMsg{T: "party", Op: "leave"})
	if len(pt.members) != 3 || h.partyOfSession(ss[1]) != nil {
		t.Fatal("leave")
	}
	h.onMessage(ss[0], clientMsg{T: "party", Op: "leave"})
	if pt.leader == 1 || h.partyOfSession(ss[2]) != pt {
		t.Fatal("leader leaving passes leadership")
	}
}

func TestPartyShareXPNearbyNonContributor(t *testing.T) {
	h, fs, p := newTestHub(t)
	join(t, h, 1, "player")
	join(t, h, 2, "player")
	join(t, h, 3, "player")
	w := h.World("DEV-TRAINING-01")
	a, b, c := h.sessions["c1"], h.sessions["c2"], h.sessions["c3"]
	h.onMessage(a, clientMsg{T: "party", Op: "invite", Target: b.name})
	h.onMessage(b, clientMsg{T: "party", Op: "accept"})
	pa, pb, pc := w.Player("c1"), w.Player("c2"), w.Player("c3")
	pa.GodMode, pb.GodMode, pc.GodMode = true, true, true
	m := w.Monsters[0]
	pa.Pos = m.Pos
	pa.Pos.X -= 20
	pb.Pos, pc.Pos = pa.Pos, pa.Pos // b in party nearby, c outsider nearby
	for i := 0; i < 3000 && m.Alive(); i++ {
		a.aim = &m.Pos
		a.actions = append(a.actions[:0], struct {
			Type string `json:"type"`
			Slot string `json:"slot,omitempty"`
		}{"attack", "basic"})
		h.step(1000.0 / 30)
	}
	p.Close()
	if m.Alive() {
		t.Fatal("monster not killed")
	}
	base := h.c.Drops[m.Def.ID].XP
	if a.xp != int64(float64(base)*1.1+0.5) || b.xp != base/2 || c.xp != 0 {
		t.Fatalf("xp a=%d b=%d c=%d (base %d)", a.xp, b.xp, c.xp, base)
	}
	if len(fs.rewards) != 2 {
		t.Fatalf("rewards persisted = %d", len(fs.rewards))
	}
	if len(w.Drops) != 1 {
		t.Fatalf("only the contributor gets a loot bag, drops=%d", len(w.Drops))
	}
}
