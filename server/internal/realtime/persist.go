package realtime

import (
	"context"
	"errors"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

// Persister runs DB jobs sequentially (preserving per-character order) with retries.
// Every economic job carries an idempotent tx_id, so a retry after an unknown outcome is safe.
type Persister struct {
	jobs    chan job
	log     *slog.Logger
	Applied atomic.Int64
	Dupes   atomic.Int64
	Failed  atomic.Int64
	done    chan struct{}
}

type job struct {
	name string
	fn   func(ctx context.Context) error
}

func NewPersister(log *slog.Logger) *Persister {
	return &Persister{jobs: make(chan job, 4096), log: log, done: make(chan struct{})}
}

func (p *Persister) Enqueue(name string, fn func(ctx context.Context) error) {
	select {
	case p.jobs <- job{name, fn}:
	default:
		// Queue full: run synchronously rather than drop an economic write.
		p.run(job{name, fn})
	}
}

func (p *Persister) run(j job) {
	backoff := 100 * time.Millisecond
	for attempt := 1; attempt <= 6; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := j.fn(ctx)
		cancel()
		switch {
		case err == nil:
			p.Applied.Add(1)
			return
		case errors.Is(err, store.ErrAlreadyApplied):
			p.Dupes.Add(1)
			return
		case errors.Is(err, store.ErrInsufficient):
			p.Failed.Add(1)
			p.log.Error("persist rejected", "job", j.name, "err", err)
			return
		}
		p.log.Warn("persist retry", "job", j.name, "attempt", attempt, "err", err)
		time.Sleep(backoff)
		backoff *= 2
	}
	p.Failed.Add(1)
	p.log.Error("persist failed permanently", "job", j.name)
}

// Run processes jobs until Close; then drains what is left.
func (p *Persister) Run() {
	defer close(p.done)
	for j := range p.jobs {
		p.run(j)
	}
}

// Close stops accepting jobs and waits until the queue is drained.
func (p *Persister) Close() {
	close(p.jobs)
	<-p.done
}
