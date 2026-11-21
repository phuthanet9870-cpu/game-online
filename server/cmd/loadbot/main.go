// Command loadbot simulates N concurrent players over the real HTTP + WebSocket protocol:
// register → login → create character → join → hunt monsters → disconnect → verify persistence.
//
//	go run ./cmd/loadbot -url http://127.0.0.1:8080 -bots 20 -duration 60s
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

type stats struct {
	joined, snapshots, rewards, kills, deaths, errors, rejected atomic.Int64
	mu                                                          sync.Mutex
	rtts                                                        []float64
	persistOK, persistBad                                       atomic.Int64
	seenPlayersMax                                              atomic.Int64
}

type vec struct{ X, Y float64 }

func post(c *http.Client, base, path string, body any) (int, []byte, error) {
	b, _ := json.Marshal(body)
	resp, err := c.Post(base+path, "application/json", bytes.NewReader(b))
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	var buf bytes.Buffer
	_, _ = buf.ReadFrom(resp.Body)
	return resp.StatusCode, buf.Bytes(), nil
}

type bot struct {
	i      int
	base   string
	run    string
	st     *stats
	dur    time.Duration
	charID int64
	gold   int64
	xp     int64
	items  int
	client *http.Client
	jarURL *url.URL
}

func (b *bot) setup() error {
	jar, _ := cookiejar.New(nil)
	b.client = &http.Client{Jar: jar, Timeout: 10 * time.Second}
	u, _ := url.Parse(b.base)
	b.jarURL = u
	user := fmt.Sprintf("bot%s_%02d", b.run, b.i)
	if code, body, err := post(b.client, b.base, "/api/auth/register", map[string]string{"username": user, "password": "loadtest-pass"}); err != nil || (code != 201 && code != 409) {
		return fmt.Errorf("register %d %s %v", code, body, err)
	}
	if code, body, err := post(b.client, b.base, "/api/auth/login", map[string]string{"username": user, "password": "loadtest-pass"}); err != nil || code != 200 {
		return fmt.Errorf("login %d %s %v", code, body, err)
	}
	code, body, err := post(b.client, b.base, "/api/characters", map[string]string{"name": fmt.Sprintf("Bot%s%02d", b.run, b.i), "weapon": "sword"})
	if err != nil || code != 201 {
		return fmt.Errorf("create char %d %s %v", code, body, err)
	}
	var ch struct{ ID int64 }
	_ = json.Unmarshal(body, &ch)
	b.charID = ch.ID
	return nil
}

func (b *bot) play(ctx context.Context) error {
	ws := strings.Replace(b.base, "http", "ws", 1) + fmt.Sprintf("/ws?char=%d", b.charID)
	hdr := http.Header{}
	for _, c := range b.client.Jar.Cookies(b.jarURL) {
		hdr.Add("Cookie", c.Name+"="+c.Value)
	}
	conn, _, err := websocket.Dial(ctx, ws, &websocket.DialOptions{HTTPHeader: hdr})
	if err != nil {
		return err
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	conn.SetReadLimit(1 << 20)
	b.st.joined.Add(1)

	var me vec
	var target *vec
	var mu sync.Mutex
	pingSent := map[float64]time.Time{}
	go func() {
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				return
			}
			var m struct {
				T        string                 `json:"t"`
				You      struct{ X, Y float64 } `json:"you"`
				Players  []json.RawMessage      `json:"players"`
				Monsters []struct {
					X, Y float64
					AI   string `json:"ai"`
				} `json:"monsters"`
				Ev []struct {
					Type     string `json:"type"`
					EntityID string `json:"entityId"`
					KillerID string `json:"killerId"`
				} `json:"ev"`
				C     float64 `json:"c"`
				Gold  int64   `json:"gold"`
				XP    int64   `json:"xp"`
				Items []struct {
					Quantity int `json:"quantity"`
				} `json:"items"`
			}
			if json.Unmarshal(data, &m) != nil {
				b.st.errors.Add(1)
				continue
			}
			switch m.T {
			case "snap":
				b.st.snapshots.Add(1)
				if n := int64(len(m.Players)); n > b.st.seenPlayersMax.Load() {
					b.st.seenPlayersMax.Store(n)
				}
				mu.Lock()
				me = vec{m.You.X, m.You.Y}
				best := math.Inf(1)
				target = nil
				for _, mo := range m.Monsters {
					if mo.AI == "DEAD" {
						continue
					}
					if d := math.Hypot(mo.X-me.X, mo.Y-me.Y); d < best {
						best = d
						t := vec{mo.X, mo.Y}
						target = &t
					}
				}
				mu.Unlock()
				for _, e := range m.Ev {
					if e.Type == "death" && e.EntityID == fmt.Sprintf("c%d", b.charID) {
						b.st.deaths.Add(1)
					}
					if e.Type == "rejected" {
						b.st.rejected.Add(1)
					}
				}
			case "reward":
				b.st.rewards.Add(1)
			case "inv":
				mu.Lock()
				b.gold, b.xp = m.Gold, m.XP
				b.items = 0
				for _, it := range m.Items {
					b.items += it.Quantity
				}
				mu.Unlock()
			case "pong":
				mu.Lock()
				if t, ok := pingSent[m.C]; ok {
					b.st.mu.Lock()
					b.st.rtts = append(b.st.rtts, float64(time.Since(t).Microseconds())/1000)
					b.st.mu.Unlock()
				}
				mu.Unlock()
			}
		}
	}()

	seq := uint64(0)
	tick := time.NewTicker(50 * time.Millisecond)
	defer tick.Stop()
	end := time.After(b.dur)
	n := 0
	for {
		select {
		case <-end:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		case <-tick.C:
		}
		n++
		mu.Lock()
		mv := [2]float64{rand.Float64()*2 - 1, rand.Float64()*2 - 1}
		var aim any
		var act []map[string]string
		if target != nil {
			dx, dy := target.X-me.X, target.Y-me.Y
			d := math.Hypot(dx, dy)
			if d > 22 {
				mv = [2]float64{dx / d, dy / d}
			} else {
				mv = [2]float64{0, 0}
				aim = []float64{target.X, target.Y}
				act = append(act, map[string]string{"type": "attack", "slot": []string{"basic", "basic", "skill1", "skill2", "basic", "skill3"}[n%6]})
			}
		}
		mu.Unlock()
		seq++
		msg := map[string]any{"t": "input", "seq": seq, "mv": mv, "aim": aim, "act": act}
		if n%20 == 0 {
			c := float64(time.Now().UnixNano())
			mu.Lock()
			pingSent[c] = time.Now()
			mu.Unlock()
			bb, _ := json.Marshal(map[string]any{"t": "ping", "c": c})
			_ = conn.Write(ctx, websocket.MessageText, bb)
		}
		bb, _ := json.Marshal(msg)
		if err := conn.Write(ctx, websocket.MessageText, bb); err != nil {
			b.st.errors.Add(1)
			return err
		}
	}
}

// verify logs in again after the server's reconnect grace and checks the DB matches the last
// inventory the server pushed over the socket.
func (b *bot) verify() {
	resp, err := b.client.Get(b.base + "/api/me")
	if err != nil {
		b.st.persistBad.Add(1)
		return
	}
	defer resp.Body.Close()
	var me struct {
		Characters []struct {
			ID   int64
			Gold int64
			XP   int64
		}
	}
	_ = json.NewDecoder(resp.Body).Decode(&me)
	for _, c := range me.Characters {
		if c.ID == b.charID {
			if c.Gold == b.gold && c.XP == b.xp {
				b.st.persistOK.Add(1)
			} else {
				fmt.Fprintf(os.Stderr, "bot %d persistence mismatch: db gold=%d xp=%d, live gold=%d xp=%d\n", b.i, c.Gold, c.XP, b.gold, b.xp)
				b.st.persistBad.Add(1)
			}
			return
		}
	}
	b.st.persistBad.Add(1)
}

func main() {
	base := flag.String("url", "http://127.0.0.1:8080", "server base URL")
	nb := flag.Int("bots", 20, "concurrent bots")
	dur := flag.Duration("duration", 60*time.Second, "play time per bot")
	wait := flag.Duration("verify-after", 3*time.Second, "wait before verifying DB state (persist queue)")
	flag.Parse()
	run := fmt.Sprintf("%04d", rand.Intn(10000))
	st := &stats{}
	bots := make([]*bot, *nb)
	for i := range bots {
		bots[i] = &bot{i: i, base: *base, run: run, st: st, dur: *dur}
		if err := bots[i].setup(); err != nil {
			fmt.Fprintln(os.Stderr, "setup failed:", err)
			os.Exit(1)
		}
	}
	start := time.Now()
	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), *dur+30*time.Second)
	defer cancel()
	var failed atomic.Int64
	for _, b := range bots {
		wg.Add(1)
		go func(b *bot) {
			defer wg.Done()
			if err := b.play(ctx); err != nil {
				failed.Add(1)
				fmt.Fprintln(os.Stderr, "bot", b.i, "error:", err)
			}
		}(b)
	}
	wg.Wait()
	elapsed := time.Since(start).Seconds()
	time.Sleep(*wait)
	for _, b := range bots {
		b.verify()
	}
	st.mu.Lock()
	sort.Float64s(st.rtts)
	p := func(q float64) float64 {
		if len(st.rtts) == 0 {
			return 0
		}
		return st.rtts[int(q*float64(len(st.rtts)-1))]
	}
	st.mu.Unlock()
	fmt.Printf("bots=%d duration=%.1fs joined=%d failed=%d\n", *nb, elapsed, st.joined.Load(), failed.Load())
	fmt.Printf("snapshots=%d (%.1f/s per bot) maxPlayersSeen=%d\n", st.snapshots.Load(), float64(st.snapshots.Load())/elapsed/float64(*nb), st.seenPlayersMax.Load())
	fmt.Printf("rewards=%d deaths=%d rejected=%d protocolErrors=%d\n", st.rewards.Load(), st.deaths.Load(), st.rejected.Load(), st.errors.Load())
	fmt.Printf("ping rtt ms: p50=%.2f p95=%.2f max=%.2f (n=%d, localhost)\n", p(0.5), p(0.95), p(1), len(st.rtts))
	fmt.Printf("persistence check: ok=%d mismatch=%d\n", st.persistOK.Load(), st.persistBad.Load())
	if failed.Load() > 0 || st.persistBad.Load() > 0 || st.joined.Load() != int64(*nb) {
		os.Exit(1)
	}
}
