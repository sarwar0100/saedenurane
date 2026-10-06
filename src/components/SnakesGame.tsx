import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Crown, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  BOT_NAMES,
  LAST_SQUARE,
  PLAYER_COLORS,
  delay,
  jumpFor,
  squareCenter,
  walkPath,
  type GamePlayer,
} from "@/lib/snakes-ladders";
import type { BoardSkin } from "@/lib/game-data";
import { useHideChrome } from "@/components/chrome";
import { avatarImageSource, useApp, userStorageKey } from "@/lib/app-store";
import { PlayerProfileSheet } from "@/components/PlayerProfileSheet";
import { createClient } from "@supabase/supabase-js";

const STEP_MS = 220;
const JUMP_MS = 750;
const TURN_SECONDS = 10;
const BOARD_Y_OFFSET = -7;
const STARTING_Y = -11;
const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] || "";
const supabaseKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const DEFAULT_MATCH_ID = "snakes-ladders-demo-match";

/* ---------------------------------- Tokens --------------------------------- */
function Token({
  player,
  offset,
  motion,
}: {
  player: GamePlayer;
  offset: number;
  motion?: "climb" | "slide" | "capture" | undefined;
}) {
  if (player.kicked) return null;

  const on = player.position >= 1;
  const c = squareCenter(player.position === 0 ? 1 : player.position);
  const startSpread = [-10, -6.7, -3.4, 0][offset] ?? 0;
  return (
    <div
      className="absolute size-[6.5%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white shadow-md overflow-visible bg-white/50"
      style={{
        left: `${c.x + (player.position === 0 ? startSpread : 0)}%`,
        bottom: `${player.position === 0 ? STARTING_Y : c.y + BOARD_Y_OFFSET}%`,
        opacity: on ? 1 : 0.6,
        transition: `left ${motion === "climb" || motion === "slide" ? JUMP_MS : motion === "capture" ? 700 : STEP_MS}ms cubic-bezier(.3,.9,.35,1), bottom ${motion === "climb" || motion === "slide" ? JUMP_MS : motion === "capture" ? 700 : STEP_MS}ms cubic-bezier(.3,.9,.35,1)`,
        zIndex: 20 + offset,
      }}
    >
      <div
        key={player.position}
        className="size-full overflow-hidden rounded-full"
        style={{
          animation:
            motion === "capture"
              ? "sg-capture 700ms cubic-bezier(.3,.9,.35,1)"
              : on
                ? `sg-hop ${motion === "climb" || motion === "slide" ? JUMP_MS : STEP_MS}ms cubic-bezier(.3,.9,.35,1)`
                : undefined,
        }}
      >
        <img
          src={avatarImageSource(player.token_url || player.avatar)}
          alt="token"
          className="size-full object-cover"
        />
      </div>
    </div>
  );
}

/* ---------------------------------- dice ---------------------------------- */

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [30, 30],
    [70, 30],
    [50, 50],
    [30, 70],
    [70, 70],
  ],
  6: [
    [30, 26],
    [70, 26],
    [30, 50],
    [70, 50],
    [30, 74],
    [70, 74],
  ],
};

function DiceFace({ value }: { value: number }) {
  return (
    <div
      className="grid size-[48px] md:size-[54px] place-items-center rounded-[12px]"
      style={{
        background: "linear-gradient(155deg,#ffffff,#f4f1e6 60%,#ded9c7)",
        boxShadow:
          "inset 0 3px 4px rgba(255,255,255,.95), inset 0 -6px 8px rgba(0,0,0,.14), 0 8px 14px rgba(0,0,0,.22)",
      }}
    >
      <svg viewBox="0 0 100 100" className="size-full p-1.5">
        {PIPS[value]!.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="8.5" fill={value === 1 ? "#c0392b" : "#141414"} />
        ))}
      </svg>
    </div>
  );
}

function PlayerAvatar({ player, pro = false }: { player: GamePlayer; pro?: boolean }) {
  return (
    <div className="relative shrink-0 size-8">
      <img
          src={avatarImageSource(player.avatar)}
        alt={player.name}
        className={`size-full rounded-md object-cover border ${pro ? "border-yellow-400 shadow-[0_0_8px_rgba(250,204,21,.8)]" : "border-black/5"} ${player.kicked ? "grayscale" : ""}`}
      />
      {pro && (
        <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-yellow-300 text-yellow-950">
          <Crown className="size-2.5" />
        </span>
      )}
      {player.kicked && (
        <>
          <span className="pointer-events-none absolute left-[-10%] right-[-10%] top-1/2 h-0.5 rotate-[-18deg] bg-[#c0392b]" />
          <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 text-[8px] font-bold text-[#c0392b]">
            Left
          </span>
        </>
      )}
    </div>
  );
}

function TurnTimer({ value }: { value: number }) {
  return (
    <span
      key={value}
      className="text-lg font-semibold leading-none"
      style={{
        color: value <= 5 ? "#c0392b" : "#141414",
        fontFamily: "Georgia, serif",
        animation: "sg-timer-pulse .9s ease-in-out",
      }}
    >
      {value}
    </span>
  );
}

/* -------------------------------- confetti -------------------------------- */

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 1.8 + Math.random() * 1.6,
        color: ["#ff6b6b", "#ffd166", "#4ade80", "#60a5fa", "#f472b6"][i % 5]!,
        size: 6 + Math.random() * 7,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b) => (
        <span
          key={b.id}
          className="absolute top-[-8%] block rounded-[2px]"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size * 1.6,
            background: b.color,
            animation: `sg-fall ${b.dur}s linear ${b.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* --------------------------------- game ----------------------------------- */

export function SnakesGame({
  board,
  me,
  stickers = [],
  initialPlayers,
  matchId = DEFAULT_MATCH_ID,
  onClose,
}: {
  board: BoardSkin & { image_url?: string };
  me: { name: string; avatar: string; token_url?: string };
  stickers?: any[];
  initialPlayers?: Array<{ id: string; name: string; avatar: string; token_url?: string }>;
  matchId?: string;
  onClose: () => void;
}) {
  useHideChrome();
  const { user, isProMember, recordGameResult } = useApp();
  const synchronizedMatch = Boolean(initialPlayers?.length && matchId !== DEFAULT_MATCH_ID);
  const localPlayerId = synchronizedMatch ? (user?.id ?? "me") : "me";
  const [phase, setPhase] = useState<"matchmaking" | "playing">(initialPlayers?.length ? "playing" : "matchmaking");
  const [gameStickers, setGameStickers] = useState(stickers);
  const [players, setPlayers] = useState<GamePlayer[]>(() => initialPlayers?.length
    ? initialPlayers.slice(0, 4).map((player, index) => ({
      id: player.id,
        name: player.name,
        avatar: player.avatar,
        color: PLAYER_COLORS[index]!,
      isHuman: player.id === (user?.id ?? "me"),
        position: 0,
        ...(player.token_url ? { token_url: player.token_url } : {}),
      }))
    : [
        {
          id: "me",
          name: me.name,
          avatar: me.avatar,
          color: PLAYER_COLORS[0]!,
          isHuman: true,
          position: 0,
          token_url: me.token_url,
        } as any,
        ...BOT_NAMES.map((n, i) => ({
          id: `bot-${i}`,
          name: n,
          avatar: `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(n)}`,
          color: PLAYER_COLORS[i + 1]!,
          isHuman: false,
          position: 0,
        })),
      ]);
  const [turn, setTurn] = useState(0);
  const [dice, setDice] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [status, setStatus] = useState("");
  const [winner, setWinner] = useState<GamePlayer | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<GamePlayer | null>(null);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const [timerRound, setTimerRound] = useState(0);
  const [matchChannelReady, setMatchChannelReady] = useState(false);
  const [tokenMotion, setTokenMotion] = useState<Record<string, "climb" | "slide" | "capture">>({});

  // ستەیتی ستیکەرەکان
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [activeStickers, setActiveStickers] = useState<Record<string, string>>({});

  const busy = useRef(false);
  const alive = useRef(true);
  const missedTurns = useRef<Record<string, number>>({});
  const playersRef = useRef(players);
  const turnRef = useRef(turn);
  const handledTimeout = useRef<string | null>(null);
  const reactionChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(
    null,
  );
  const gameStatusUpdate = useRef(Promise.resolve());
  const turnHandlerRef = useRef<(payload: { playerId?: string; turnIndex?: number; roll?: number; turnId?: string }) => void>(() => {});
  const processedTurnIds = useRef(new Set<string>());
  playersRef.current = players;
  turnRef.current = turn;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id) return;
    const updateGameStatus = (status: "online" | "in_game") => {
      gameStatusUpdate.current = gameStatusUpdate.current
        .then(async () => {
          const { error } = await supabase.rpc("set_profile_game_status", {
            new_status: status,
          });
          if (error) console.warn("Profile game status update failed:", error.message);
        })
        .catch((error: unknown) => {
          console.warn("Profile game status update failed:", error);
        });
    };
    updateGameStatus("in_game");
    return () => updateGameStatus("online");
  }, [user?.id]);

  useEffect(() => {
    if (!winner || winner.id !== localPlayerId) return;
    recordGameResult(true);
    // The winner is set once per game; the overlay owns the final result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPlayerId, winner]);

  useEffect(() => {
    const loadStickers = (slots?: Array<string | null>) => {
      const storedSlots =
        slots ??
        (() => {
          if (!user?.id) return null;
          try {
            const raw = localStorage.getItem(userStorageKey(user.id, "stickers"));
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })();
      if (!storedSlots) {
        setGameStickers(stickers);
        return;
      }
      setGameStickers(
        storedSlots
          .filter((url): url is string => typeof url === "string" && Boolean(url))
          .map(
            (url) =>
              stickers.find((sticker) => sticker.image_url === url) ?? {
                id: `persisted-sticker-${url}`,
                name: "Saved sticker",
                image_url: url,
              },
          ),
      );
    };

    loadStickers();
    const handleStickerUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; slots?: Array<string | null> }>)
        .detail;
      if (detail?.userId === user?.id) loadStickers(detail.slots);
    };
    window.addEventListener("user-stickers-updated", handleStickerUpdate);
    return () => window.removeEventListener("user-stickers-updated", handleStickerUpdate);
  }, [stickers, user?.id]);

  const playCaptureSound = useCallback((soundUrl?: string | null) => {
    if (!soundUrl) return;
    const audio = new Audio(soundUrl);
    audio.currentTime = 0;
    void audio.play().catch((error) => console.error("Audio playback error:", error));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel(`snakes-ladders-match:${matchId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "PIECE_CAPTURED" }, ({ payload }) => {
      playCaptureSound(payload?.soundUrl);
    });
    channel.on("broadcast", { event: "TURN_ROLLED" }, ({ payload }) => {
      turnHandlerRef.current(payload);
    });
    reactionChannelRef.current = channel;
    void channel.subscribe((status) => setMatchChannelReady(status === "SUBSCRIBED"));

    return () => {
      reactionChannelRef.current = null;
      setMatchChannelReady(false);
      void supabase.removeChannel(channel);
    };
  }, [matchId, playCaptureSound]);

  useEffect(() => {
    if (phase !== "matchmaking") return;
    const t = setTimeout(() => setPhase("playing"), 2600);
    return () => clearTimeout(t);
  }, [phase]);

  const setPos = useCallback((id: string, pos: number) => {
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, position: pos } : p)));
  }, []);

  const clearTokenMotion = useCallback((id: string, delayMs: number) => {
    window.setTimeout(() => {
      setTokenMotion((motions) => {
        const next = { ...motions };
        delete next[id];
        return next;
      });
    }, delayMs);
  }, []);

  const nextTurnIndex = useCallback((from: number, roster: GamePlayer[]) => {
    for (let offset = 1; offset <= roster.length; offset++) {
      const candidate = roster[(from + offset) % roster.length];
      if (candidate && !candidate.kicked) return (from + offset) % roster.length;
    }
    return from;
  }, []);

  const currentPlayer = players[turn];

  useEffect(() => {
    if (phase !== "playing" || winner || !currentPlayer || currentPlayer.kicked) return;

    setTimeLeft(TURN_SECONDS);
    const interval = window.setInterval(() => {
      setTimeLeft((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentPlayer?.id, currentPlayer?.kicked, phase, timerRound, turn, winner]);

  const takeTurn = useCallback(
    async (playerIndex: number, automatic = false, synchronizedRoll?: number) => {
      if (busy.current || winner) return;
      busy.current = true;

      const index = playerIndex;
      const current = players[index]!;
      if (current.kicked) {
        busy.current = false;
        return;
      }
      if (!automatic) missedTurns.current[current.id] = 0;

      setRolling(true);
      for (let i = 0; i < 8; i++) {
        setDice(1 + Math.floor(Math.random() * 6));
        await delay(55);
      }
      const roll = synchronizedRoll ?? (1 + Math.floor(Math.random() * 6));
      setDice(roll);
      setRolling(false);
      await delay(180);
      if (!alive.current) {
        busy.current = false;
        return;
      }

      let pos = current.position;
      for (const step of walkPath(current.position, roll)) {
        pos = step;
        setPos(current.id, step);
        await delay(STEP_MS);
        if (!alive.current) return;
      }

      const jump = jumpFor(pos);
      if (jump) {
        setStatus(
          jump.kind === "ladder"
            ? `${current.name} بە پەیژە سەرکەوت!`
            : `${current.name} مار خواردی!`,
        );
        await delay(250);
        if (jump.kind === "ladder") {
          setTokenMotion((motions) => ({ ...motions, [current.id]: "climb" }));
        } else {
          setTokenMotion((motions) => ({ ...motions, [current.id]: "slide" }));
        }
        pos = jump.to;
        setPos(current.id, jump.to);
        await delay(JUMP_MS);
        clearTokenMotion(current.id, 0);
      }
      if (!alive.current) return;

      const capturedPlayers = playersRef.current.filter(
        (player) => player.id !== current.id && player.position === pos && pos > 0,
      );
      const eaten = capturedPlayers.map((player) => player.name);
      if (capturedPlayers.length) {
        if (current.id === localPlayerId) {
          const captureEvent = {
            type: "CAPTURE_PIECE",
            attackerId: user?.id ?? current.id,
            soundUrl: user?.id
              ? localStorage.getItem(userStorageKey(user.id, "active_sound"))
              : null,
            targetId: capturedPlayers[0]?.id,
            capturedPlayerIds: capturedPlayers.map((player) => player.id),
            at: Date.now(),
          };
          playCaptureSound(captureEvent.soundUrl);
          void reactionChannelRef.current?.send({
            type: "broadcast",
            event: "PIECE_CAPTURED",
            payload: captureEvent,
          });
        }
        setTokenMotion((motions) => ({
          ...motions,
          ...Object.fromEntries(capturedPlayers.map((player) => [player.id, "capture"])),
        }));
        capturedPlayers.forEach((player) => clearTokenMotion(player.id, 700));
      }
      setPlayers((ps) => {
        return ps.map((p) =>
          p.id !== current.id && p.position === pos && pos > 0 ? { ...p, position: 0 } : p,
        );
      });
      if (eaten.length) {
        setStatus(`${current.name} ${eaten.join(" و ")}ی خوارد!`);
        await delay(500);
      }

      if (pos === LAST_SQUARE) {
        setWinner({ ...current, position: pos });
        busy.current = false;
        return;
      }

      // یاسای ژمارە ٦: نۆرە ناگۆڕێت و یاریزان خۆی دیسان زارەکە دەداتەوە
      if (roll === 6) {
        setStatus(`${current.name} ٦ی هێنا — جارێکی تر!`);
        busy.current = false;
        setTimeLeft(TURN_SECONDS);
        setTimerRound((round) => round + 1);
        return;
      }

      busy.current = false;
      setTurn(nextTurnIndex(index, players));
      setStatus("");
    },
    [localPlayerId, nextTurnIndex, playCaptureSound, players, setPos, user?.id, winner],
  );

  turnHandlerRef.current = ({ playerId, turnIndex, roll, turnId }) => {
    if (
      !synchronizedMatch ||
      typeof playerId !== "string" ||
      typeof turnIndex !== "number" ||
      typeof roll !== "number" ||
      !Number.isInteger(roll) ||
      roll < 1 ||
      roll > 6 ||
      (turnId && processedTurnIds.current.has(turnId)) ||
      turnRef.current !== turnIndex ||
      playersRef.current[turnIndex]?.id !== playerId ||
      playerId === localPlayerId
    ) return;
    if (turnId) processedTurnIds.current.add(turnId);
    void takeTurn(turnIndex, false, roll);
  };

  const requestTurn = useCallback(async (playerIndex: number, automatic = false) => {
    const current = playersRef.current[playerIndex];
    if (!current || current.id !== localPlayerId) return;
    if (!synchronizedMatch) {
      void takeTurn(playerIndex, automatic);
      return;
    }
    if (!matchChannelReady || !reactionChannelRef.current) return;
    const roll = 1 + Math.floor(Math.random() * 6);
    const turnId = crypto.randomUUID();
    const result = await reactionChannelRef.current.send({
      type: "broadcast",
      event: "TURN_ROLLED",
      payload: { playerId: current.id, turnIndex: playerIndex, roll, turnId },
    });
    if (result !== "ok") {
      setStatus("پەیوەندی یاری لەدەست چوو، دووبارە هەوڵ بدەرەوە");
      return;
    }
    processedTurnIds.current.add(turnId);
    void takeTurn(playerIndex, automatic, roll);
  }, [localPlayerId, matchChannelReady, synchronizedMatch, takeTurn]);

  useEffect(() => {
    if (timeLeft !== 0 || !currentPlayer || winner || busy.current) return;
    const timeoutKey = `${currentPlayer.id}:${timerRound}`;
    if (handledTimeout.current === timeoutKey) return;
    handledTimeout.current = timeoutKey;

    const misses = (missedTurns.current[currentPlayer.id] ?? 0) + 1;
    missedTurns.current[currentPlayer.id] = misses;
    if (misses >= 3) {
      const playerId = currentPlayer.id;
      const playerName = currentPlayer.name;
      const roster = playersRef.current;
      setPlayers((ps) =>
        ps.map((p) => (p.id === playerId ? { ...p, position: 0, kicked: true } : p)),
      );
      setStatus(`${playerName} Left`);
      busy.current = false;
      setTurn(nextTurnIndex(turn, roster));
      setTimerRound((round) => round + 1);
      return;
    }

    if (currentPlayer.id === localPlayerId) {
      void requestTurn(turn, true);
    } else if (!synchronizedMatch) {
      void takeTurn(turn, true);
    }
  }, [currentPlayer, localPlayerId, nextTurnIndex, requestTurn, synchronizedMatch, takeTurn, timeLeft, timerRound, turn, winner]);

  useEffect(() => {
    if (synchronizedMatch || phase !== "playing" || winner) return;
    const current = players[turn];
    if (!current || current.isHuman) return;
    const t = setTimeout(() => void takeTurn(turn), 700);
    return () => clearTimeout(t);
  }, [phase, turn, winner, players, synchronizedMatch, takeTurn]);

  const handleSendSticker = (stickerUrl: string) => {
    setActiveStickers((prev) => ({ ...prev, me: stickerUrl }));
    setStickerPanelOpen(false);

    // مانەوە بۆ ماوەی ٣ چرکە و پاشان سڕینەوەی
    setTimeout(() => {
      setActiveStickers((prev) => {
        const next = { ...prev };
        delete next["me"];
        return next;
      });
    }, 3000);
  };

  const myTurn = players[turn]?.id === localPlayerId && !players[turn]?.kicked && !winner && !busy.current;
  const timerVisible =
    phase === "playing" &&
    !!currentPlayer &&
    !currentPlayer.kicked &&
    !winner &&
    !rolling &&
    !busy.current;
  const meP = players.find((player) => player.id === localPlayerId) ?? players[0]!;
  const opponents = players.slice(1);
  const myTurnActive = players[turn]?.id === meP.id;
  const boardImageUrl = board?.image_url || "";

  return (
    <div
      dir="rtl"
      className="animate-soft-in fixed inset-0 z-50 mx-auto flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      style={{
        background: "radial-gradient(135% 85% at 50% 8%, #fff9ee 0%, #f4e8d3 52%, #e8d6b9 100%)",
      }}
    >
      <style>{`
@keyframes sg-fall { 0%{transform:translateY(0) rotate(0)} 100%{transform:translateY(115vh) rotate(720deg)} }
@keyframes sg-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
@keyframes sg-pulse-subtle { 0%,100%{transform:scale(1)} 50%{transform:scale(1.015)} }
@keyframes sg-radar { 0%{transform:scale(.4);opacity:.9} 100%{transform:scale(2.4);opacity:0} }
@keyframes sg-pop { 0%{transform:scale(.6);opacity:0} 25%{transform:scale(1.05);opacity:1} 80%{opacity:1} 100%{transform:scale(1);opacity:0} }
@keyframes sg-hop { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-24%)} }
@keyframes sg-capture { 0%{transform:translateY(0) scale(1)} 35%{transform:translateY(-40%) scale(1.04)} 100%{transform:translateY(0) scale(.92)} }
@keyframes sg-lobby-exit { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.96)} }
@keyframes sg-timer-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
`}</style>

      {/* top bar */}
      <div className="relative mt-1 flex shrink-0 items-center justify-between px-1 z-40">
        <button
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-9 items-center justify-center rounded-full bg-white text-[#c0392b] shadow-md"
        >
          <ArrowRight className="size-4 md:size-5" />
        </button>
        <div className="flex flex-col items-center">
          <div
            className="flex items-center gap-1.5 rounded-full border-2 bg-white px-3 py-1.5 shadow-md"
            style={{ borderColor: players[turn]?.color.from || "#c0392b" }}
          >
            <span
              className="size-2 rounded-full"
              style={{ background: players[turn]?.color.from || "#c0392b" }}
            />
            <span className="text-[11px] md:text-sm font-extrabold text-[#2c2c2c]">
              {myTurn ? "نۆرەی تۆیە" : `نۆرەی ${players[turn]?.name ?? ""}`}
            </span>
          </div>
        </div>
        <span className="size-9" />
      </div>

      {phase === "matchmaking" ? (
        <Matchmaking players={players} onExit={onClose} />
      ) : (
        <div className="my-1 flex flex-1 flex-col justify-between overflow-visible relative">
          {/* پەنجەرەی ستیکەرەکان */}
          <div
            className={`absolute bottom-16 left-0 z-50 flex items-center transition-transform duration-300 ease-in-out ${
              stickerPanelOpen ? "translate-x-0" : "-translate-x-[calc(100%-2.5rem)]"
            }`}
            dir="ltr"
          >
            <div className="flex items-center rounded-r-2xl bg-white/95 backdrop-blur-md p-1.5 shadow-xl border border-black/10 border-l-0">
              <div className="flex gap-2 max-w-[220px] overflow-x-auto no-scrollbar px-1 py-0.5">
                {gameStickers.length > 0 ? (
                  gameStickers.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSendSticker(s.image_url)}
                      className="press size-11 shrink-0 rounded-xl overflow-hidden bg-black/5 p-1"
                    >
                      <img src={s.image_url} alt="sticker" className="size-full object-contain" />
                    </button>
                  ))
                ) : (
                  <span className="text-xs font-bold text-center text-muted-foreground whitespace-nowrap px-2">
                    هیچ ستیکەرێک نییە
                  </span>
                )}
              </div>

              <button
                onClick={() => setStickerPanelOpen(!stickerPanelOpen)}
                className="press flex size-8 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-black/5 ml-1"
                aria-label="ستیکەرەکان"
              >
                {stickerPanelOpen ? (
                  <ChevronLeft className="size-5" />
                ) : (
                  <ChevronRight className="size-5" />
                )}
              </button>
            </div>
          </div>

          {/* opponents */}
          <div className="relative mt-1 flex w-full shrink-0 justify-between gap-1.5 px-1 z-30">
            {opponents.map((p) => {
              const active = players[turn]?.id === p.id;
              return (
                <div key={p.id} className="relative flex-1">
                  <div
                    className="relative flex items-center gap-1.5 rounded-xl bg-white p-1 shadow-sm transition-all"
                    style={{
                      border: active ? `2px solid ${p.color.from}` : "2px solid transparent",
                      boxShadow: active ? `0 0 12px ${p.color.from}` : "0 2px 4px rgba(0,0,0,.05)",
                    }}
                  >
                    <button
                      onClick={() => setSelectedPlayer(p)}
                      className="press shrink-0"
                      aria-label={`پرۆفایلی ${p.name}`}
                    >
                      <PlayerAvatar player={p} />
                    </button>
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      <p className="truncate text-[10px] font-bold text-[#2c2c2c]">{p.name}</p>
                      <span className="mt-0.5 inline-block w-max rounded bg-[#f4f1e6] px-1 py-0.5 text-[9px] font-bold text-[#8a6d1f]">
                        {p.position}/100
                      </span>
                    </div>
                    {timerVisible && players[turn]?.id === p.id && (
                      <div className="absolute left-2 top-1/2 -translate-y-1/2">
                        <TurnTimer value={timeLeft} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* board (وێنەی تەختە لە ئەدمینەوە) */}
          <div className="relative my-1 flex min-h-0 w-full flex-1 items-center justify-center overflow-visible px-1 py-2 z-20 [container-type:size]">
            <div
              dir="ltr"
              className="relative translate-y-[clamp(0.25rem,1.2vh,0.75rem)] overflow-visible rounded-[16px] bg-white p-1 shadow-[0_12px_30px_rgba(91,61,28,.2)]"
              style={{
                aspectRatio: "1 / 1",
                width: "min(100%, 100cqh)",
                maxWidth: "100%",
                maxHeight: "100%",
                flexShrink: 1,
              }}
            >
              {boardImageUrl && (
                <img
                  src={boardImageUrl}
                  alt={board.name}
                  className="absolute inset-1 size-[calc(100%-0.5rem)] object-cover"
                />
              )}
              <div className="absolute inset-1 z-10">
                {players.map((p, i) => (
                  <Token
                    key={p.id}
                    player={p}
                    offset={i}
                    {...(tokenMotion[p.id] ? { motion: tokenMotion[p.id] } : {})}
                  />
                ))}
              </div>
            </div>
          </div>

          <p className="mt-1 h-4 shrink-0 text-center text-xs font-bold text-[#6b5a3e]">{status}</p>

          {/* نیشاندانی ستیکەر لە ناوەڕاست و کەمێک سەرووی زارەکە بەتەواوی بێجووڵە */}
          {Object.entries(activeStickers).length > 0 && (
            <div className="absolute left-1/2 bottom-36 z-[100] -translate-x-1/2 pointer-events-none">
              {Object.entries(activeStickers).map(([id, url]) => (
                <img
                  key={id}
                  src={url}
                  alt="sticker"
                  className="size-28 md:size-32 object-contain drop-shadow-2xl"
                />
              ))}
            </div>
          )}

          {/* dice */}
          <div className="relative mt-1 mb-2.5 flex shrink-0 items-center justify-center z-30">
            <button
              onClick={() => void requestTurn(turn)}
              disabled={!myTurn || (synchronizedMatch && !matchChannelReady)}
              aria-label="تاوەدان"
              className="press disabled:opacity-50"
            >
              <DiceFace value={dice} />
            </button>
          </div>

          {/* my bar */}
          <div className="relative z-30">
            <div
              className="relative mb-1 ml-auto flex w-[calc(100%-1.5rem)] shrink-0 items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 pl-12 transition-all"
              style={{
                border: myTurnActive ? `2px solid ${meP.color.from}` : "2px solid transparent",
                boxShadow: myTurnActive
                  ? `0 0 12px ${meP.color.from}`
                  : "0 3px 8px rgba(0,0,0,.08)",
              }}
            >
              <div className="relative">
                <button
                  onClick={() => setSelectedPlayer(meP)}
                  className="press shrink-0"
                  aria-label={`پرۆفایلی ${meP.name}`}
                >
                  <PlayerAvatar player={meP} pro={isProMember && !!user?.id && meP.id === localPlayerId} />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#2c2c2c]">{meP.name}</p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#eee8dc]">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${meP.position}%`, background: meP.color.from }}
                  />
                </div>
              </div>
              <span className="rounded-md bg-[#f4f1e6] px-2 py-0.5 text-[11px] font-bold text-[#8a6d1f]">
                {meP.position}/100
              </span>
              {timerVisible && myTurnActive && (
                <div className="absolute left-2 top-1/2 -translate-y-1/2">
                  <TurnTimer value={timeLeft} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {winner && <WinOverlay winner={winner} onClose={onClose} />}
      {selectedPlayer && (
        <PlayerProfileSheet
          player={{
            id: selectedPlayer.id,
            name: selectedPlayer.name,
            handle: "",
            online: true,
            avatar: selectedPlayer.avatar,
            games_played: 0,
            wins: 0,
            points: 0,
            gold: 0,
          }}
          followersCount={Math.max(0, players.length - 1)}
          followingCount={Math.max(0, players.length - 1)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}

function Matchmaking({ players, onExit }: { players: GamePlayer[]; onExit: () => void }) {
  const [found, setFound] = useState(1);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setFound(2), 800);
    const t2 = setTimeout(() => setFound(3), 1500);
    const t3 = setTimeout(() => setFound(4), 2100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const handleExit = () => {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(onExit, 260);
  };

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center gap-6"
      style={{ animation: exiting ? "sg-lobby-exit .26s ease-in forwards" : undefined }}
    >
      <div className="relative grid size-28 place-items-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute size-28 rounded-full border border-[#c0392b]/50"
            style={{ animation: `sg-radar 2.1s ease-out ${i * 0.7}s infinite` }}
          />
        ))}
        <Loader2 className="size-10 animate-spin text-[#c0392b]" />
      </div>
      <p className="text-lg md:text-xl font-extrabold text-[#2c2c2c]">گەڕان بەدوای یاریزاندا…</p>
      <div className="flex gap-4">
        {players.map((p, i) => (
          <div
            key={p.id}
            className="flex flex-col items-center gap-2 transition-all duration-500"
            style={{
              opacity: i < found ? 1 : 0.25,
              transform: i < found ? "scale(1)" : "scale(.85)",
            }}
          >
            <div
              className="size-14 overflow-hidden rounded-full border-2 bg-white"
              style={{ borderColor: p.color.from }}
            >
              <img src={avatarImageSource(p.avatar)} alt={p.name} className="size-full object-cover" />
            </div>
            <span className="max-w-16 md:max-w-20 truncate text-[11px] md:text-xs font-semibold text-[#5c5140]">
              {p.name}
            </span>
          </div>
        ))}
      </div>
      <p className="text-sm text-[#8a7c66]">{found}/4 یاریزان ئامادەن</p>
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        className="press mt-2 min-w-40 rounded-xl border-2 border-[#c0392b]/65 bg-white/75 px-12 py-3 text-base font-extrabold text-[#a93226] shadow-sm transition-colors hover:bg-[#fff5f3] disabled:opacity-60"
      >
        دەرچوون
      </button>
    </div>
  );
}

function WinOverlay({ winner, onClose }: { winner: GamePlayer; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 px-6">
      <Confetti />
      <div className="animate-soft-in w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div
          className="mx-auto size-24 overflow-hidden rounded-full border-4"
          style={{ borderColor: winner.color.from }}
        >
          <img src={avatarImageSource(winner.avatar)} alt={winner.name} className="size-full object-cover" />
        </div>
        <h3 className="mt-4 text-3xl font-extrabold text-neutral-900">
          {winner.isHuman ? "تۆ بردتەوە! 🎉" : "یاری تەواو بوو"}
        </h3>
        <p className="mt-2 text-base text-neutral-600">{winner.name} گەیشتە خانەی ١٠٠</p>
        <button
          onClick={onClose}
          className="press mt-6 w-full rounded-2xl bg-[#c0392b] py-4 text-lg font-bold text-white"
        >
          گەڕانەوە
        </button>
      </div>
    </div>
  );
}
