package auth

import "testing"

func TestHashAndVerify(t *testing.T) {
	h, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("correct horse", h) || VerifyPassword("wrong horse", h) || VerifyPassword("x", "garbage") {
		t.Fatal("verify mismatch")
	}
	h2, _ := HashPassword("correct horse")
	if h == h2 {
		t.Fatal("salt not random")
	}
}

func TestTokensAndValidation(t *testing.T) {
	a, ha, _ := NewSessionToken()
	b, _, _ := NewSessionToken()
	if a == b || len(ha) != 32 || string(HashToken(a)) != string(ha) {
		t.Fatal("token generation")
	}
	for _, ok := range []string{"abc", "Player_01"} {
		if ValidateUsername(ok) != nil {
			t.Fatal(ok)
		}
	}
	for _, bad := range []string{"ab", "has space", "<script>", "averyveryverylongname"} {
		if ValidateUsername(bad) == nil {
			t.Fatal(bad)
		}
	}
	if ValidateCharacterName("นักดาบ") != nil || ValidateCharacterName("a b") == nil {
		t.Fatal("character name validation")
	}
}
