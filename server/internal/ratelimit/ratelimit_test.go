package ratelimit

import (
	"testing"
	"time"
)

func TestBucket(t *testing.T) {
	b := NewBucket(3, 1)
	now := time.Unix(0, 0)
	for i := 0; i < 3; i++ {
		if !b.Allow(now) {
			t.Fatal("should allow burst")
		}
	}
	if b.Allow(now) {
		t.Fatal("should block after burst")
	}
	if !b.Allow(now.Add(1100 * time.Millisecond)) {
		t.Fatal("should refill")
	}
}

func TestKeyedIsolation(t *testing.T) {
	k := NewKeyed(1, 0.001)
	if !k.Allow("a") || k.Allow("a") || !k.Allow("b") {
		t.Fatal("keys must be independent")
	}
}
