// Package ratelimit implements small token buckets for HTTP (per key) and per-connection limits.
package ratelimit

import (
	"sync"
	"time"
)

type Bucket struct {
	Capacity float64
	Refill   float64 // tokens per second
	tokens   float64
	last     time.Time
}

func NewBucket(capacity, perSecond float64) *Bucket {
	return &Bucket{Capacity: capacity, Refill: perSecond, tokens: capacity}
}

// Allow consumes one token if available.
func (b *Bucket) Allow(now time.Time) bool {
	if !b.last.IsZero() {
		b.tokens += now.Sub(b.last).Seconds() * b.Refill
		if b.tokens > b.Capacity {
			b.tokens = b.Capacity
		}
	}
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

// Keyed is a concurrency-safe map of buckets (e.g. per client IP) with lazy cleanup.
type Keyed struct {
	mu       sync.Mutex
	buckets  map[string]*Bucket
	capacity float64
	refill   float64
	lastGC   time.Time
}

func NewKeyed(capacity, perSecond float64) *Keyed {
	return &Keyed{buckets: map[string]*Bucket{}, capacity: capacity, refill: perSecond}
}

func (k *Keyed) Allow(key string) bool {
	now := time.Now()
	k.mu.Lock()
	defer k.mu.Unlock()
	if now.Sub(k.lastGC) > time.Minute {
		for key, b := range k.buckets {
			if now.Sub(b.last) > 10*time.Minute {
				delete(k.buckets, key)
			}
		}
		k.lastGC = now
	}
	b := k.buckets[key]
	if b == nil {
		b = NewBucket(k.capacity, k.refill)
		k.buckets[key] = b
	}
	return b.Allow(now)
}
