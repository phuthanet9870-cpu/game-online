package rbac

import "testing"

func TestPlayerHasNoStaffCapabilities(t *testing.T) {
	for _, c := range []Capability{GMHudOpen, PlayersView, PlayersKick, GodModeTest, HealTest, ItemsGrantTest} {
		if Has("player", c) {
			t.Fatalf("player must not have %s", c)
		}
	}
	if Has("unknown-role", GMHudOpen) || ValidRole("superuser") {
		t.Fatal("unknown roles must have nothing")
	}
}

func TestStaffCapabilities(t *testing.T) {
	if !Has("owner", GMHudOpen) || !Has("gm", PlayersKick) || Has("helper", PlayersKick) || Has("moderator", GodModeTest) {
		t.Fatal("capability table mismatch")
	}
}
