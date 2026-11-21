// Package httpapi exposes HTTPS auth/account/character endpoints, the WSS game gateway and the
// static web client. TLS terminates at the reverse proxy in production (documented in README).
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"

	"github.com/phuthanet9870-cpu/game-online/server/internal/auth"
	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
	"github.com/phuthanet9870-cpu/game-online/server/internal/ratelimit"
	"github.com/phuthanet9870-cpu/game-online/server/internal/realtime"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

const cookieName = "tpe_session"
const sessionTTL = 7 * 24 * time.Hour

type Config struct {
	WebDir         string   // built client (apps/web-game/dist); empty = API only
	SecureCookies  bool     // force Secure cookies (set true behind HTTPS)
	TrustProxy     bool     // read client IP from X-Forwarded-For
	AllowedOrigins []string // extra origins for WS/CSRF checks, e.g. "127.0.0.1:5173" for Vite dev
	AuthPerMinute  float64  // [TUNING] auth requests per IP per minute
	Version        string
}

type Server struct {
	cfg    Config
	st     *store.Store
	c      *content.Content
	hub    *realtime.Hub
	log    *slog.Logger
	authRL *ratelimit.Keyed
	mux    *http.ServeMux
}

func New(cfg Config, st *store.Store, c *content.Content, hub *realtime.Hub, log *slog.Logger) *Server {
	if cfg.AuthPerMinute <= 0 {
		cfg.AuthPerMinute = 20
	}
	s := &Server{cfg: cfg, st: st, c: c, hub: hub, log: log, authRL: ratelimit.NewKeyed(cfg.AuthPerMinute, cfg.AuthPerMinute/60), mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("POST /api/auth/register", s.limited(s.register))
	s.mux.HandleFunc("POST /api/auth/login", s.limited(s.login))
	s.mux.HandleFunc("POST /api/auth/logout", s.logout)
	s.mux.HandleFunc("GET /api/session", s.session)
	s.mux.HandleFunc("GET /api/me", s.me)
	s.mux.HandleFunc("POST /api/characters", s.createCharacter)
	s.mux.HandleFunc("POST /api/characters/{id}/delete", s.deleteCharacter)
	s.mux.HandleFunc("GET /ws", s.ws)
	if cfg.WebDir != "" {
		s.mux.Handle("/", s.static(cfg.WebDir))
	}
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "same-origin")
	h.Set("X-Frame-Options", "DENY")
	h.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "+
		"font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'")
	if r.Method == http.MethodPost {
		if !s.originAllowed(r) {
			writeErr(w, http.StatusForbidden, "origin not allowed")
			return
		}
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			writeErr(w, http.StatusUnsupportedMediaType, "content-type must be application/json")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) originAllowed(r *http.Request) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		return true // non-browser clients; cookies are SameSite=Strict anyway
	}
	o = strings.TrimPrefix(strings.TrimPrefix(o, "https://"), "http://")
	if o == r.Host {
		return true
	}
	for _, a := range s.cfg.AllowedOrigins {
		if o == a {
			return true
		}
	}
	return false
}

func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.TrustProxy {
		if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
			return strings.TrimSpace(strings.Split(xf, ",")[0])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (s *Server) limited(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.authRL.Allow(s.clientIP(r)) {
			writeErr(w, http.StatusTooManyRequests, "too many requests, try again later")
			return
		}
		next(w, r)
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func decode(r *http.Request, v any) error {
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	return d.Decode(v)
}

/* ------------------------------------------------------------------ routes */

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true, "version": s.cfg.Version, "online": s.hub.Online.Load(), "instance": s.hub.InstanceID(), "phase": 2})
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if err := decode(r, &c); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	if err := auth.ValidateUsername(c.Username); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if err := auth.ValidatePassword(c.Password); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	hash, err := auth.HashPassword(c.Password)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	if _, err := s.st.CreateAccount(r.Context(), c.Username, hash); err != nil {
		if errors.Is(err, store.ErrConflict) {
			writeErr(w, 409, "username already taken")
			return
		}
		s.log.Error("register", "err", err)
		writeErr(w, 500, "internal error")
		return
	}
	writeJSON(w, 201, map[string]any{"ok": true})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if err := decode(r, &c); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	ip, ua := s.clientIP(r), r.UserAgent()
	a, err := s.st.AccountByUsername(r.Context(), c.Username)
	if errors.Is(err, store.ErrNotFound) {
		auth.DummyVerify(c.Password)
		_ = s.st.RecordLogin(r.Context(), nil, c.Username, false, ip, ua)
		writeErr(w, 401, "invalid username or password")
		return
	}
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	if a.Disabled || (a.LockedUntil != nil && a.LockedUntil.After(time.Now())) {
		writeErr(w, 403, "account locked or disabled, try again later")
		return
	}
	if !auth.VerifyPassword(c.Password, a.PasswordHash) {
		_ = s.st.RecordLogin(r.Context(), &a.ID, c.Username, false, ip, ua)
		writeErr(w, 401, "invalid username or password")
		return
	}
	token, hash, err := auth.NewSessionToken()
	if err == nil {
		err = s.st.CreateSession(r.Context(), a.ID, hash, sessionTTL, ip, ua)
	}
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	_ = s.st.RecordLogin(r.Context(), &a.ID, c.Username, true, ip, ua)
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode,
		Secure: s.cfg.SecureCookies || r.TLS != nil, MaxAge: int(sessionTTL.Seconds())})
	writeJSON(w, 200, map[string]any{"ok": true, "username": a.Username})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		_ = s.st.RevokeSession(r.Context(), auth.HashToken(c.Value))
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) account(r *http.Request) (*store.Account, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" || len(c.Value) > 128 {
		return nil, false
	}
	a, err := s.st.SessionAccount(r.Context(), auth.HashToken(c.Value))
	return a, err == nil
}

// session tells the client whether its cookie is valid without producing an HTTP error.
func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	_, ok := s.account(r)
	writeJSON(w, 200, map[string]any{"authenticated": ok})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	a, ok := s.account(r)
	if !ok {
		writeErr(w, 401, "not logged in")
		return
	}
	chars, err := s.st.ListCharacters(r.Context(), a.ID)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	if chars == nil {
		chars = []*store.Character{}
	}
	weapons := make([]map[string]any, 0, len(s.c.Weapons))
	for _, wd := range s.c.Weapons {
		weapons = append(weapons, map[string]any{"id": wd.ID, "name": wd.Name, "role": wd.Role, "available": wd.Implemented})
	}
	writeJSON(w, 200, map[string]any{"account": map[string]any{"username": a.Username, "role": a.Role}, "characters": chars,
		"maxCharacters": s.c.Progression.MaxCharactersPerAccount, "weapons": weapons})
}

func (s *Server) createCharacter(w http.ResponseWriter, r *http.Request) {
	a, ok := s.account(r)
	if !ok {
		writeErr(w, 401, "not logged in")
		return
	}
	var in struct {
		Name   string `json:"name"`
		Weapon string `json:"weapon"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	if err := auth.ValidateCharacterName(in.Name); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	wd := s.c.Weapon(in.Weapon)
	if wd == nil {
		writeErr(w, 400, "weapon must be one of staff, sword, dagger, bow, grimoire, gauntlet")
		return
	}
	if !wd.Implemented {
		writeErr(w, 400, wd.Name+" will be playable in Phase 3")
		return
	}
	var starter []store.ItemStack
	for _, it := range s.c.Progression.StarterItems {
		starter = append(starter, store.ItemStack{TemplateID: it.ItemID, Quantity: it.Quantity})
	}
	ch, err := s.st.CreateCharacter(r.Context(), a.ID, in.Name, in.Weapon, s.c.Progression.MaxCharactersPerAccount, starter)
	if errors.Is(err, store.ErrConflict) {
		writeErr(w, 409, strings.TrimPrefix(err.Error(), "conflict: "))
		return
	}
	if err != nil {
		s.log.Error("create character", "err", err)
		writeErr(w, 500, "internal error")
		return
	}
	writeJSON(w, 201, ch)
}

func (s *Server) deleteCharacter(w http.ResponseWriter, r *http.Request) {
	a, ok := s.account(r)
	if !ok {
		writeErr(w, 401, "not logged in")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	var in struct {
		ConfirmName string `json:"confirmName"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "invalid JSON")
		return
	}
	if s.hub.Online.Load() > 0 && s.isOnline(id) {
		writeErr(w, 409, "character is in the world; log out first")
		return
	}
	if err := s.st.SoftDeleteCharacter(r.Context(), a.ID, id, in.ConfirmName); err != nil {
		writeErr(w, 404, "character not found or name confirmation mismatch")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) isOnline(charID int64) bool { return s.hub.HasSession(realtime.PlayerID(charID)) }

/* --------------------------------------------------------------------- ws */

func (s *Server) ws(w http.ResponseWriter, r *http.Request) {
	a, ok := s.account(r)
	if !ok {
		writeErr(w, 401, "not logged in")
		return
	}
	charID, err := strconv.ParseInt(r.URL.Query().Get("char"), 10, 64)
	if err != nil {
		writeErr(w, 400, "missing char")
		return
	}
	ch, err := s.st.CharacterForAccount(r.Context(), a.ID, charID)
	if err != nil {
		writeErr(w, 403, "character not owned by this account")
		return
	}
	items, err := s.st.Items(r.Context(), ch.ID)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.cfg.AllowedOrigins})
	if err != nil {
		return // Accept already wrote the HTTP error (e.g. bad origin)
	}
	conn.SetReadLimit(4096)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client := realtime.NewClient(func(reason string) {
		_ = conn.Close(websocket.StatusPolicyViolation, reason)
		cancel()
	})
	pid := realtime.PlayerID(ch.ID)
	if err := s.hub.Join(r.Context(), realtime.JoinRequest{Account: a, Character: ch, Items: items, Client: client}); err != nil {
		_ = conn.Close(websocket.StatusInternalError, "join failed")
		return
	}
	go func() { // writer
		for {
			select {
			case b := <-client.Outbox():
				wctx, wc := context.WithTimeout(ctx, 5*time.Second)
				err := conn.Write(wctx, websocket.MessageText, b)
				wc()
				if err != nil {
					cancel()
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			break
		}
		if typ != websocket.MessageText {
			continue
		}
		s.hub.Receive(pid, client, data)
	}
	s.hub.Leave(pid, client)
	_ = conn.Close(websocket.StatusNormalClosure, "")
}

/* ----------------------------------------------------------------- static */

func (s *Server) static(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))
		if st, err := os.Stat(p); err != nil || st.IsDir() {
			if !strings.HasPrefix(r.URL.Path, "/assets/") {
				w.Header().Set("Cache-Control", "no-cache")
				http.ServeFile(w, r, filepath.Join(dir, "index.html"))
				return
			}
		}
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable") // hashed file names
		}
		fs.ServeHTTP(w, r)
	})
}
