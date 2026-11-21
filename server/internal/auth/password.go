// Package auth: password hashing (argon2id), session tokens and input validation.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"golang.org/x/crypto/argon2"
)

// argon2id parameters (OWASP minimum profile: m=19MiB, t=2, p=1).
const (
	argonTime    = 2
	argonMemory  = 19 * 1024
	argonThreads = 1
	argonKeyLen  = 32
)

func HashPassword(pw string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	b := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemory, argonTime, argonThreads, b.EncodeToString(salt), b.EncodeToString(key)), nil
}

func VerifyPassword(pw, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	b := base64.RawStdEncoding
	salt, err1 := b.DecodeString(parts[4])
	want, err2 := b.DecodeString(parts[5])
	if err1 != nil || err2 != nil {
		return false
	}
	got := argon2.IDKey([]byte(pw), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// DummyVerify burns comparable CPU when the username does not exist (timing equalisation).
func DummyVerify(pw string) {
	argon2.IDKey([]byte(pw), make([]byte, 16), argonTime, argonMemory, argonThreads, argonKeyLen)
}

// NewSessionToken returns the opaque token for the cookie and the SHA-256 hash stored in the DB.
func NewSessionToken() (token string, hash []byte, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", nil, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	return token, HashToken(token), nil
}

func HashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

var (
	usernameRe = regexp.MustCompile(`^[A-Za-z0-9_]{3,16}$`)
	// Character names: letters (incl. Thai), digits, underscore; 3–16 runes.
	charNameRe = regexp.MustCompile(`^[\p{L}\p{M}0-9_]{3,16}$`)
)

var ErrInvalid = errors.New("invalid input")

func ValidateUsername(u string) error {
	if !usernameRe.MatchString(u) {
		return fmt.Errorf("%w: username must be 3-16 chars A-Z a-z 0-9 _", ErrInvalid)
	}
	return nil
}

func ValidatePassword(p string) error {
	if len(p) < 8 || len(p) > 128 {
		return fmt.Errorf("%w: password must be 8-128 characters", ErrInvalid)
	}
	return nil
}

func ValidateCharacterName(n string) error {
	if !charNameRe.MatchString(n) || len([]rune(n)) > 16 {
		return fmt.Errorf("%w: name must be 3-16 letters/digits/_", ErrInvalid)
	}
	return nil
}
