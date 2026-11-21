package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
	"github.com/phuthanet9870-cpu/game-online/server/internal/realtime"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

func newTestServer(t *testing.T, perMinute float64) *httptest.Server {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	st, err := store.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.DB.Exec(ctx, `drop schema public cascade; create schema public;`); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	_, file, _, _ := runtime.Caller(0)
	c, err := content.Load(filepath.Join(filepath.Dir(file), "../../../game-data"))
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	p := realtime.NewPersister(log)
	go p.Run()
	hub := realtime.NewHub(realtime.DefaultConfig(), c, st, p, log)
	hctx, cancel := context.WithCancel(ctx)
	go hub.Run(hctx)
	srv := httptest.NewServer(New(Config{AuthPerMinute: perMinute}, st, c, hub, log))
	t.Cleanup(func() { srv.Close(); cancel(); st.Close() })
	return srv
}

func post(t *testing.T, srv *httptest.Server, path, body string, hdr map[string]string) *http.Response {
	req, _ := http.NewRequest("POST", srv.URL+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	return res
}

func TestCSRFAndContentTypeGuards(t *testing.T) {
	srv := newTestServer(t, 100)
	if r := post(t, srv, "/api/auth/register", `{"username":"abc","password":"password123"}`, map[string]string{"Origin": "https://evil.example"}); r.StatusCode != 403 {
		t.Fatalf("cross-origin POST status %d", r.StatusCode)
	}
	if r := post(t, srv, "/api/auth/register", `{"username":"abc","password":"password123"}`, map[string]string{"Content-Type": "text/plain"}); r.StatusCode != 415 {
		t.Fatalf("text/plain POST status %d", r.StatusCode)
	}
	if r := post(t, srv, "/api/auth/register", `{"username":"abc","password":"password123","role":"owner"}`, nil); r.StatusCode != 400 {
		t.Fatalf("unknown field (role escalation attempt) status %d", r.StatusCode)
	}
}

func TestLoginCookieFlagsAndAuthGates(t *testing.T) {
	srv := newTestServer(t, 100)
	if r := post(t, srv, "/api/auth/register", `{"username":"cookie","password":"password123"}`, nil); r.StatusCode != 201 {
		t.Fatalf("register %d", r.StatusCode)
	}
	r := post(t, srv, "/api/auth/login", `{"username":"cookie","password":"password123"}`, nil)
	cookies := r.Cookies()
	if r.StatusCode != 200 || len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatalf("login %d cookies %+v", r.StatusCode, cookies)
	}
	// unauthenticated websocket and API access are refused
	res, _ := http.Get(srv.URL + "/ws?char=1")
	if res.StatusCode != 401 {
		t.Fatalf("anonymous ws status %d", res.StatusCode)
	}
	res, _ = http.Get(srv.URL + "/api/me")
	if res.StatusCode != 401 {
		t.Fatalf("anonymous /api/me status %d", res.StatusCode)
	}
	// a valid session cannot join someone else's character
	req, _ := http.NewRequest("GET", srv.URL+"/ws?char=999", nil)
	req.AddCookie(cookies[0])
	res, _ = http.DefaultClient.Do(req)
	if res.StatusCode != 403 {
		t.Fatalf("foreign character ws status %d", res.StatusCode)
	}
}

func TestAuthRateLimit(t *testing.T) {
	srv := newTestServer(t, 5)
	limited := false
	for i := 0; i < 12; i++ {
		if post(t, srv, "/api/auth/login", `{"username":"nobody","password":"password123"}`, nil).StatusCode == 429 {
			limited = true
		}
	}
	if !limited {
		t.Fatal("expected 429 after burst")
	}
}
