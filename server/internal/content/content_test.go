package content

import (
	"path/filepath"
	"runtime"
	"testing"
)

func TestLoadAllMaps(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	c, err := Load(filepath.Join(filepath.Dir(file), "../../../game-data"))
	if err != nil {
		t.Fatal(err)
	}
	if c.StartMap != "CITY-AETHERIA" || c.Maps["CITY-AETHERIA"].Kind != "city" || len(c.Maps["FARM-01"].Portals) != 2 {
		t.Fatalf("maps not loaded: start=%s", c.StartMap)
	}
	core := 0
	for _, m := range c.Maps {
		if m.Core {
			core++
		}
	}
	if core != 4 {
		t.Fatalf("core maps so far = %d (city + 3 farms)", core)
	}
}
