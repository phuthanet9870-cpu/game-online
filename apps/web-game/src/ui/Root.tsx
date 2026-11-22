import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CONTENT, getWeapon } from '../core/content';
import { GameSimulation } from '../core/simulation';
import type { WorldSource } from '../core/worldSource';
import { startGame, stopGame } from '../game/gameHost';
import { api, ApiError, serverAvailable, type MeResponse } from '../net/api';
import { NetWorld } from '../net/NetWorld';
import { GameHud } from './App';

type Screen =
  | { k: 'boot' }
  | { k: 'landing' }
  | { k: 'auth' }
  | { k: 'chars'; me: MeResponse }
  | { k: 'game'; world: WorldSource };

function Logo() {
  return (
    <div className="logo">
      <span className="logo-the">THE</span>
      <span className="logo-power">POWER</span>
      <span className="logo-eclipse">ECLIPSE</span>
    </div>
  );
}

export function Root() {
  const [screen, setScreen] = useState<Screen>({ k: 'boot' });

  const loadMe = useCallback(async () => {
    try {
      const { authenticated } = await api.session();
      setScreen(authenticated ? { k: 'chars', me: await api.me() } : { k: 'auth' });
    } catch {
      setScreen({ k: 'auth' });
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (await serverAvailable()) await loadMe();
      else setScreen({ k: 'landing' });
    })();
  }, [loadMe]);

  const playOffline = () => {
    const world = new GameSimulation({
      map: CONTENT.trainingMap,
      weapon: getWeapon('sword'),
      monsters: CONTENT.monsters,
      player: CONTENT.player,
      seed: Date.now() & 0xffffffff,
    });
    startGame(world);
    setScreen({ k: 'game', world });
  };

  const playOnline = (charId: number) => {
    const world = new NetWorld(charId);
    startGame(world);
    setScreen({ k: 'game', world });
  };

  const exitGame = async () => {
    if (screen.k !== 'game') return;
    const online = screen.world.mode === 'online';
    screen.world.dispose?.();
    stopGame();
    if (online) await loadMe();
    else setScreen({ k: (await serverAvailable()) ? 'auth' : 'landing' });
  };

  switch (screen.k) {
    case 'boot':
      return (
        <div className="screen">
          <div className="screen-card panel">
            <Logo />
            <p className="start-note">กำลังตรวจสอบเซิร์ฟเวอร์…</p>
          </div>
        </div>
      );
    case 'landing':
      return (
        <div className="screen">
          <div className="screen-card panel">
            <Logo />
            <p className="start-sub">เซิร์ฟเวอร์ไม่พร้อมใช้งาน</p>
            <p className="start-note">
              หน้านี้เปิดได้โดยไม่มีเกมเซิร์ฟเวอร์ (เช่นในอาร์ติแฟกต์ทดสอบ) — เล่นได้เฉพาะ Phase 1 sandbox
              แบบออฟไลน์ ซึ่งไม่บันทึกข้อมูล · โหมดออนไลน์ต้องรันเซิร์ฟเวอร์ Go (ดู README)
            </p>
            <button className="btn-primary" onClick={playOffline}>
              เล่น Sandbox ออฟไลน์
            </button>
          </div>
        </div>
      );
    case 'auth':
      return <AuthScreen onLoggedIn={loadMe} onOffline={playOffline} />;
    case 'chars':
      return (
        <CharacterScreen
          me={screen.me}
          onPlay={playOnline}
          onRefresh={loadMe}
          onLogout={async () => {
            await api.logout().catch(() => {});
            setScreen({ k: 'auth' });
          }}
        />
      );
    case 'game':
      return (
        <GameHud
          key={screen.world.mode}
          world={screen.world}
          onExit={exitGame}
          onTrial={() => {
            screen.world.dispose?.();
            stopGame();
            playOffline();
          }}
        />
      );
  }
}

function AuthScreen({ onLoggedIn, onOffline }: { onLoggedIn: () => void; onOffline: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') await api.register(username, password);
      await api.login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <form className="screen-card panel auth" onSubmit={submit} data-testid="auth">
        <Logo />
        <div className="tabs center">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            เข้าสู่ระบบ
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            สมัครบัญชี
          </button>
        </div>
        <label>
          ชื่อผู้ใช้
          <input
            id="auth-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={16}
            required
          />
        </label>
        <label>
          รหัสผ่าน
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        {mode === 'register' && (
          <p className="hint">ชื่อผู้ใช้ 3–16 ตัว (A–Z, 0–9, _) · รหัสผ่านอย่างน้อย 8 ตัว</p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn-primary" type="submit" disabled={busy}>
          {mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครและเข้าสู่ระบบ'}
        </button>
        <button type="button" className="link" onClick={onOffline}>
          หรือเล่น Phase 1 sandbox แบบออฟไลน์ (ไม่บันทึกข้อมูล)
        </button>
      </form>
    </div>
  );
}

function CharacterScreen(props: {
  me: MeResponse;
  onPlay: (id: number) => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const { me } = props;
  const [name, setName] = useState('');
  const [weapon, setWeapon] = useState('sword');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirm, setConfirm] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.createCharacter(name, weapon);
      setName('');
      props.onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'สร้างตัวละครไม่สำเร็จ');
    }
  };

  const remove = async (id: number) => {
    try {
      await api.deleteCharacter(id, confirm);
      setDeleting(null);
      setConfirm('');
      props.onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    }
  };

  return (
    <div className="screen">
      <div className="screen-card panel chars" data-testid="chars">
        <div className="chars-head">
          <Logo />
          <div className="account">
            บัญชี <b>{me.account.username}</b>
            {me.account.role !== 'player' && <span className="role">{me.account.role}</span>}
            <button className="link" onClick={props.onLogout}>
              ออกจากระบบ
            </button>
          </div>
        </div>
        <h3>
          ตัวละคร ({me.characters.length}/{me.maxCharacters})
        </h3>
        {me.characters.length === 0 && <p className="hint">ยังไม่มีตัวละคร — สร้างตัวแรกด้านล่าง</p>}
        <ul className="char-list">
          {me.characters.map((c) => (
            <li key={c.id}>
              <div>
                <b>{c.name}</b> · Lv.{c.level} · {getWeapon(c.weapon as 'sword').name} · Gold{' '}
                {c.gold.toLocaleString()}
              </div>
              <div className="row">
                <button
                  className="btn-primary small"
                  onClick={() => props.onPlay(c.id)}
                  data-testid={`play-${c.name}`}
                >
                  เข้าสู่เกม
                </button>
                <button
                  className="btn-secondary small"
                  onClick={() => setDeleting(deleting === c.id ? null : c.id)}
                >
                  ลบ
                </button>
              </div>
              {deleting === c.id && (
                <div className="confirm-delete">
                  <span>พิมพ์ชื่อ “{c.name}” เพื่อยืนยันการลบ (กู้คืนได้ผ่านทีมงานตามนโยบาย)</span>
                  <input
                    id={`confirm-${c.id}`}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <button
                    className="btn-secondary small danger"
                    disabled={confirm !== c.name}
                    onClick={() => remove(c.id)}
                  >
                    ยืนยันลบ
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {me.characters.length < me.maxCharacters && (
          <form className="create" onSubmit={create}>
            <h3>สร้างตัวละครใหม่ · ไม่มีคลาส · เลือกอาวุธเริ่มต้น 1 ชนิด</h3>
            <div className="weapon-grid">
              {me.weapons.map((w) => (
                <button
                  type="button"
                  key={w.id}
                  className={`weapon ${weapon === w.id ? 'active' : ''} ${w.available ? '' : 'locked'}`}
                  disabled={!w.available}
                  title={w.available ? w.role : `${w.name} — เล่นได้ใน Phase 3`}
                  onClick={() => setWeapon(w.id)}
                >
                  <b>{w.name}</b>
                  <span>{w.available ? w.role : '🔒 Phase 3'}</span>
                </button>
              ))}
            </div>
            <div className="row">
              <input
                id="char-name"
                placeholder="ชื่อตัวละคร (3–16 ตัว)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={16}
                required
              />
              <button className="btn-primary small" type="submit">
                สร้างตัวละคร
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
