// Command gameserver is the THE POWER: ECLIPSE authoritative server (modular monolith).
//
//	gameserver serve                      # HTTP API + WSS gateway + static client
//	gameserver migrate                    # apply database migrations
//	gameserver grant-role -username X -role owner
//
// Configuration via environment (see README): DATABASE_URL, ADDR, GAME_DATA, WEB_DIR,
// TEST_WORLD, SECURE_COOKIES, TRUST_PROXY, ALLOWED_ORIGINS, AUTH_PER_MINUTE.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
	"github.com/phuthanet9870-cpu/game-online/server/internal/httpapi"
	"github.com/phuthanet9870-cpu/game-online/server/internal/rbac"
	"github.com/phuthanet9870-cpu/game-online/server/internal/realtime"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

const version = "0.2.0-phase2"

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envBool(k string, def bool) bool {
	v, err := strconv.ParseBool(os.Getenv(k))
	if err != nil {
		return def
	}
	return v
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cmd := "serve"
	args := os.Args[1:]
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		cmd, args = args[0], args[1:]
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required (e.g. postgres://user:pass@127.0.0.1:5432/tpe)")
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	st, err := store.Open(ctx, dbURL)
	if err != nil {
		log.Error("database", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	switch cmd {
	case "migrate":
		applied, err := st.Migrate(ctx)
		if err != nil {
			log.Error("migrate", "err", err)
			os.Exit(1)
		}
		log.Info("migrations applied", "count", len(applied), "names", applied)
	case "grant-role":
		fs := flag.NewFlagSet("grant-role", flag.ExitOnError)
		user := fs.String("username", "", "account username")
		role := fs.String("role", "", "player|helper|moderator|gm|senior_gm|administrator|owner")
		_ = fs.Parse(args)
		if !rbac.ValidRole(*role) || *user == "" {
			fmt.Fprintln(os.Stderr, "usage: gameserver grant-role -username NAME -role ROLE")
			os.Exit(2)
		}
		if err := st.SetRole(ctx, *user, *role); err != nil {
			log.Error("grant-role", "err", err)
			os.Exit(1)
		}
		_ = st.Audit(ctx, store.AuditEntry{RequestID: "cli-" + strconv.FormatInt(time.Now().UnixNano(), 36), Action: "account.role.set", Target: *user,
			ParamsJSON: []byte(fmt.Sprintf(`{"role":%q}`, *role)), Result: "ok", Reason: "server CLI (operator shell access)"})
		log.Info("role granted", "username", *user, "role", *role)
	case "serve":
		if envBool("AUTO_MIGRATE", true) {
			if _, err := st.Migrate(ctx); err != nil {
				log.Error("migrate", "err", err)
				os.Exit(1)
			}
		}
		serve(ctx, log, st)
	default:
		fmt.Fprintln(os.Stderr, "unknown command", cmd)
		os.Exit(2)
	}
}

func serve(ctx context.Context, log *slog.Logger, st *store.Store) {
	c, err := content.Load(env("GAME_DATA", "../game-data"))
	if err != nil {
		log.Error("content", "err", err)
		os.Exit(1)
	}
	rcfg := realtime.DefaultConfig()
	rcfg.TestWorld = envBool("TEST_WORLD", true)
	persist := realtime.NewPersister(log)
	go persist.Run()
	hub := realtime.NewHub(rcfg, c, st, persist, log)
	hubCtx, hubCancel := context.WithCancel(context.Background())
	hubDone := make(chan struct{})
	go func() { hub.Run(hubCtx); close(hubDone) }()

	var origins []string
	for _, o := range strings.Split(env("ALLOWED_ORIGINS", ""), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	perMin, _ := strconv.ParseFloat(env("AUTH_PER_MINUTE", "20"), 64)
	api := httpapi.New(httpapi.Config{
		WebDir: env("WEB_DIR", ""), SecureCookies: envBool("SECURE_COOKIES", false), TrustProxy: envBool("TRUST_PROXY", false),
		AllowedOrigins: origins, AuthPerMinute: perMin, Version: version,
	}, st, c, hub, log)
	srv := &http.Server{Addr: env("ADDR", "127.0.0.1:8080"), Handler: api, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		log.Info("listening", "addr", srv.Addr, "version", version, "testWorld", rcfg.TestWorld, "instance", hub.InstanceID())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http", "err", err)
			os.Exit(1)
		}
	}()
	<-ctx.Done()
	log.Info("shutting down")
	sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(sctx)
	hubCancel()
	<-hubDone
	persist.Close() // drain pending economic writes before exit
	log.Info("stopped", "applied", persist.Applied.Load(), "dupes", persist.Dupes.Load(), "failed", persist.Failed.Load())
}
