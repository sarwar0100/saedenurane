import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Volume2, Sticker, LayoutGrid, Castle, Settings, Play, Coins, Plus, Search, Loader2, X, Crown, UserPlus, Users } from "lucide-react";
import { boards as defaultBoards, tokens as defaultTokens } from "@/lib/game-data";
import type { BoardSkin } from "@/lib/game-data";
import { avatarImageSource, useApp, userStorageKey, type Friend } from "@/lib/app-store";
import { supabase } from "@/lib/supabase";
import { useHideChrome } from "@/components/chrome";
import { AdminPanel } from "@/components/AdminPanel";
import { SnakesGame } from "@/components/SnakesGame";
import { GoldBar } from "@/components/GoldBar";
import { toast } from "sonner";

const API_KEY = 'ywuSvBa2XpYz5dGoe5Owg5zeBAxP93Ya';
const BANNED_TERMS = ['سێکس', 'پۆرن', 'گان', 'قوز', 'کێر', 'سکسی', 'porn', 'sex', 'pussy', 'dick', 'puse', 'deck', 'nude', 'naked', '18+'];

type StickerItem = {
  id: string;
  name: string;
  image_url: string;
  price?: number | string | null;
};

type LobbyPlayer = { id: string; name: string; avatar: string; token_url?: string };
type LobbyMember = LobbyPlayer & { isHost: boolean };
type LobbySession = { id: string; hostId: string; maxPlayers: 2 | 3 | 4; isHost: boolean };
type LobbyMatchConfig = {
  gameId: string;
  lobbyId: string;
  hostId: string;
  board: BoardSkin & { image_url?: string };
  players: LobbyPlayer[];
};
type QuickMatchQueueResult = {
  status: "waiting" | "matched";
  match_config?: LobbyMatchConfig | null;
  lobby_created_at?: string;
};
type GameInvitation = { id: string; lobby_id: string; sender_id: string; receiver_id: string; status: string };
type IncomingLobbyInvitation = { invitation: GameInvitation; sender: LobbyPlayer; maxPlayers: 2 | 3 | 4 };

const QUICK_MATCH_DEFAULT_BOARD: BoardSkin = {
  id: "b1",
  name: "Classic Board",
  colors: ["#176b52", "#e4b84f", "#d15b4d"],
};

function normalizeBoardSkin(board: Partial<BoardSkin> | null | undefined): BoardSkin {
  const colors = board?.colors;
  const hasValidColors = Array.isArray(colors)
    && colors.length >= 3
    && colors.slice(0, 3).every((color) => typeof color === "string" && color.trim().length > 0);
  return {
    id: typeof board?.id === "string" && board.id.trim() ? board.id.trim() : QUICK_MATCH_DEFAULT_BOARD.id,
    name: typeof board?.name === "string" && board.name.trim() ? board.name.trim() : QUICK_MATCH_DEFAULT_BOARD.name,
    colors: hasValidColors
      ? [colors[0]!, colors[1]!, colors[2]!] as [string, string, string]
      : [...QUICK_MATCH_DEFAULT_BOARD.colors],
  };
}

async function loadLobbyMembers(lobbyId: string, hostId: string): Promise<LobbyMember[]> {
  if (!supabase) return [];
  const { data: memberships, error: membershipError } = await supabase
    .from("lobby_players")
    .select("user_id, token_url, joined_at")
    .eq("lobby_id", lobbyId)
    .order("joined_at", { ascending: true });
  if (membershipError || !memberships?.length) return [];

  const memberIds = memberships.map((membership) => membership.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", memberIds);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return memberships.map((membership) => {
    const profile = profileById.get(membership.user_id);
    return {
      id: membership.user_id,
      name: profile?.display_name ?? profile?.username ?? "یاریزان",
      avatar: profile?.avatar_url ?? "",
      ...(membership.token_url ? { token_url: membership.token_url } : {}),
      isHost: membership.user_id === hostId,
    };
  });
}

function buildGiphyUrl(query = '', offset = 0) {
  const endpoint = query && query.trim() !== '' ? 'search' : 'trending';
  const queryParam = query && query.trim() !== '' ? `&q=${encodeURIComponent(query)}` : '';
  return `https://api.giphy.com/v1/gifs/${endpoint}?api_key=${API_KEY}${queryParam}&limit=50&offset=${offset}&rating=g`;
}

async function fetchStickers(query = "", offset = 0): Promise<StickerItem[]> {
  const targetUrl = buildGiphyUrl(query, offset);
  console.log("--> GIPHY REQUEST URL:", targetUrl);

  try {
    const response = await fetch(targetUrl);
    console.log("--> GIPHY STATUS:", response.status);
    const data = await response.json() as { data?: Array<{ id: string; title?: string; images?: { fixed_height?: { url?: string } } }> };
    console.log("--> GIPHY DATA:", data);

    if (!response.ok) {
      throw new Error(`GIPHY request failed: ${response.status} ${response.statusText}`);
    }

    if (data.data) {
      const stickers = data.data
        .map((item) => ({
          id: `giphy-${item.id}`,
          name: item.title || "GIPHY sticker",
          image_url: item.images?.fixed_height?.url || "",
        }))
        .filter((item) => item.image_url);
      return stickers;
    }
    return [];
  } catch (error) {
    console.error("--> GIPHY ERROR:", error);
    throw error;
  }
}

// شوێنێک بۆ خەزنکردنی دەنگەکان لە میمۆری تا بێ دواکەوتن لێبدەن
const audioCache: Record<string, any> = {};

export const Route = createFileRoute("/app/play")({
  head: () => ({
    meta: [
      { title: "Game - Snakes and Ladders" },
      { name: "description", content: "Snakes and Ladders Game" },
    ],
  }),
  component: PlayTab,
});

function PlayTab() {
  const { user, spendGold, unlockedStickerSlots, unlockStickerSlot } = useApp();
  const stickerSlotsStorageKey = user?.id ? userStorageKey(user.id, "stickers") : null;
  const soundStorageKey = user?.id ? userStorageKey(user.id, "active_sound") : null;
  const [overlay, setOverlay] = useState<"token" | "board" | "sound" | "sticker" | "admin" | "friends-play" | null>(null);

  const [dbSounds, setDbSounds] = useState<any[]>([]);
  const [dbStickers, setDbStickers] = useState<any[]>([]);
  const [giphyStickers, setGiphyStickers] = useState<StickerItem[]>([]);
  const [dbBoards, setDbBoards] = useState<any[]>([]);
  const [dbTokens, setDbTokens] = useState<any[]>([]);

  // هەڵبژاردنە ناوخۆییەکان بۆ سەکۆکان
  const [selectedSoundUrl, setSelectedSoundUrl] = useState<string | null>(() => {
    if (typeof window === "undefined" || !soundStorageKey) return null;
    return localStorage.getItem(soundStorageKey);
  });
  const [selectedStickerSlots, setSelectedStickerSlots] = useState<Array<string | null>>(() => {
    if (typeof window === "undefined") return [null, null, null, null, null];
    try {
      if (!stickerSlotsStorageKey) return [null, null, null, null, null];
      const saved = localStorage.getItem(stickerSlotsStorageKey);
      const parsed = saved ? JSON.parse(saved) : null;
      const slots = Array.isArray(parsed) && parsed.length === 5
          ? parsed.map((value) => typeof value === "string" ? value : null)
          : [null, null, null, null, null];
      return slots;
    } catch {
      return [null, null, null, null, null];
    }
  });

  // ستەیتی کڕینەکان
  const [purchasedIds, setPurchasedIds] = useState<string[]>([]);
  const [purchaseModalItem, setPurchaseModalItem] = useState<any | null>(null);
  const hydratedStickerKey = useRef<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!soundStorageKey) {
      setSelectedSoundUrl(null);
      return;
    }
    setSelectedSoundUrl(localStorage.getItem(soundStorageKey));
  }, [soundStorageKey]);

  useEffect(() => {
    if (!stickerSlotsStorageKey) {
      setSelectedStickerSlots([null, null, null, null, null]);
      hydratedStickerKey.current = null;
      return;
    }
    try {
      const saved = localStorage.getItem(stickerSlotsStorageKey);
      const parsed = saved ? JSON.parse(saved) : null;
      const slots = Array.isArray(parsed) && parsed.length === 5
        ? parsed.map((value) => typeof value === "string" ? value : null)
        : [null, null, null, null, null];
      setSelectedStickerSlots(slots);
      hydratedStickerKey.current = stickerSlotsStorageKey;
    } catch {
      setSelectedStickerSlots([null, null, null, null, null]);
      hydratedStickerKey.current = stickerSlotsStorageKey;
    }
  }, [stickerSlotsStorageKey]);

  useEffect(() => {
    if (!stickerSlotsStorageKey) return;
    if (hydratedStickerKey.current !== stickerSlotsStorageKey) return;
    localStorage.setItem(stickerSlotsStorageKey, JSON.stringify(selectedStickerSlots));
    window.dispatchEvent(new CustomEvent("user-stickers-updated", {
      detail: { userId: user?.id, slots: selectedStickerSlots },
    }));
    selectedStickerSlots.forEach((url) => {
      if (url) {
        const image = new Image();
        image.src = url;
      }
    });
  }, [selectedStickerSlots, stickerSlotsStorageKey, user?.id]);

  const fetchData = async () => {
    if (!supabase) return;
    const { data: sounds } = await supabase.from("sounds").select("*");
    const { data: stickers } = await supabase.from("stickers").select("*");
    const { data: boards } = await supabase.from("boards").select("*");
    const { data: tokens } = await supabase.from("tokens").select("*");
    
    if (sounds) {
      setDbSounds(sounds);
      sounds.forEach((s) => {
        if (!audioCache[s.id] && s.audio_url) {
          const audio = new Audio(s.audio_url);
          audio.preload = "auto";
          audioCache[s.id] = audio;
        }
      });
    }
    if (stickers) setDbStickers(stickers);
    if (boards) setDbBoards(boards);
    if (tokens) setDbTokens(tokens);
  };

  const handleConfirmPurchase = () => {
    if (purchaseModalItem) {
      const price = Number(purchaseModalItem.price) || 0;
      if (!spendGold(price)) {
        toast.error("زێرەکەت بەش ناکات", { duration: 1000 });
        return;
      }
      
      // زیادکردنی ئایتمەکە بۆ لیستی کڕدراوەکان
      setPurchasedIds((prev) => prev.includes(purchaseModalItem.id) ? prev : [...prev, purchaseModalItem.id]);
      setPurchaseModalItem(null);
    }
  };

  // پاڵاوتنی ئەو ستیکەرانەی کە بەکارهێنەر لە دەرەوە هەڵیبژاردوون تا بدرێنە یارییەکە
  const stickerCatalog = [...dbStickers, ...giphyStickers];
  const activeStickers = selectedStickerSlots
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl))
    .map((imageUrl) => stickerCatalog.find((st) => st.image_url === imageUrl) ?? {
      id: `persisted-sticker-${imageUrl}`,
      name: "Saved sticker",
      image_url: imageUrl,
    });

  const assignSticker = (slotIndex: number, imageUrl: string) => {
    setSelectedStickerSlots((prev) => {
      const next = prev.map((value, index) => (index === slotIndex || value === imageUrl ? null : value));
      next[slotIndex] = imageUrl;
      return next;
    });
  };

  const removeSticker = (slotIndex: number) => {
    setSelectedStickerSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  };

  return (
    <section className="relative w-full h-dvh max-w-md mx-auto overflow-hidden flex flex-col justify-center p-3 select-none">
      <button
        onClick={() => setOverlay("admin")}
        className="absolute top-4 right-4 z-10 glass press flex size-10 items-center justify-center rounded-full text-primary"
      >
        <Settings className="size-5" />
      </button>

      <PlayGameStarter
        stickers={activeStickers}
        customBoards={dbBoards}
        customTokens={dbTokens}
        onOpenSticker={() => setOverlay("sticker")}
        onOpenSound={() => setOverlay("sound")}
        onOpenToken={() => setOverlay("token")}
        onOpenBoard={() => setOverlay("board")}
      />

      {overlay === "token" && <TokenPicker onClose={() => setOverlay(null)} />}
      {overlay === "board" && <BoardPicker onClose={() => setOverlay(null)} />}
      {overlay === "sound" && (
        <SoundList
          items={dbSounds}
          selectedUrl={selectedSoundUrl}
          onSelect={(url) => {
            setSelectedSoundUrl(url);
            if (!soundStorageKey) return;
            if (url) localStorage.setItem(soundStorageKey, url);
            else localStorage.removeItem(soundStorageKey);
          }}
          onReplaceSlot={() => spendGold(15)}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "sticker" && (
          <StickerList
          items={dbStickers} 
          onGiphyItems={setGiphyStickers}
          selectedSlots={selectedStickerSlots}
          unlockedSlots={[0, ...(unlockedStickerSlots ?? []).filter((slotIndex) => slotIndex !== 0)]}
          onUnlockSlot={(slotIndex) => {
            const didUnlock = unlockStickerSlot(slotIndex);
            if (!didUnlock) {
              toast.error("Not enough Gold", { duration: 1200 });
            }
            return didUnlock;
          }}
          onAssign={assignSticker}
          onRemove={removeSticker}
          purchasedIds={purchasedIds}
          onBuyRequest={setPurchaseModalItem}
          onClose={() => setOverlay(null)} 
        />
      )}
      {overlay === "admin" && <AdminPanel onClose={() => { setOverlay(null); fetchData(); }} />}
      
      {/* پەنجەرەی کڕین (Modal) */}
      {purchaseModalItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200">
          <div className="bg-[#2e7d32] rounded-3xl p-6 w-full max-w-[18rem] flex flex-col items-center shadow-2xl scale-100 animate-in zoom-in-95 duration-200 border-2 border-green-400/30">
            <div className="size-16 mb-4 bg-white/20 rounded-full flex items-center justify-center shadow-inner">
               <Coins className="size-8 text-yellow-300" />
            </div>
            <h3 className="text-white text-lg font-bold mb-6 text-center">دڵنیای دەتەوێت بیکڕیت؟</h3>
            <div className="flex gap-3 w-full">
               <button 
                 onClick={() => setPurchaseModalItem(null)} 
                 className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-2xl font-bold transition-colors shadow-sm"
               >
                 نەخێر
               </button>
               <button 
                 onClick={handleConfirmPurchase} 
                 className="flex-1 bg-green-400 hover:bg-green-300 text-green-950 py-2.5 rounded-2xl font-bold transition-colors shadow-sm"
               >
                 بەڵێ
               </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlayGameStarter({
  stickers,
  customBoards,
  customTokens,
  onOpenSticker,
  onOpenSound,
  onOpenToken,
  onOpenBoard,
}: {
  stickers: any[];
  customBoards: any[];
  customTokens: any[];
  onOpenSticker: () => void;
  onOpenSound: () => void;
  onOpenToken: () => void;
  onOpenBoard: () => void;
}) {
  const QUICK_MATCH_COUNTDOWN_SECONDS = 15;
  const { boardId, tokenId, user, visibleFriends } = useApp();
  const [playing, setPlaying] = useState(false);
  const [quickMatchWaiting, setQuickMatchWaiting] = useState(false);
  const [quickMatchCountdown, setQuickMatchCountdown] = useState(QUICK_MATCH_COUNTDOWN_SECONDS);
  const [quickMatchLobbyId, setQuickMatchLobbyId] = useState<string | null>(null);
  const [quickMatchLobbyCreatedAt, setQuickMatchLobbyCreatedAt] = useState<string | null>(null);
  const [quickMatchPlayers, setQuickMatchPlayers] = useState<LobbyPlayer[]>([]);
  const [friendsLobbyOpen, setFriendsLobbyOpen] = useState(false);
  const [lobbyMatch, setLobbyMatch] = useState<LobbyMatchConfig | null>(null);
  const [lobbySession, setLobbySession] = useState<LobbySession | null>(null);
  const [lobbyMembers, setLobbyMembers] = useState<LobbyMember[]>([]);
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [incomingInvitation, setIncomingInvitation] = useState<IncomingLobbyInvitation | null>(null);
  const [respondingToInvitation, setRespondingToInvitation] = useState(false);
  const visibleFriendsRef = useRef(visibleFriends);
  const quickMatchStartPending = useRef(false);
  const quickMatchJoinPending = useRef(false);
  const quickMatchCancelRequested = useRef(false);
  const quickMatchCountdownRef = useRef(QUICK_MATCH_COUNTDOWN_SECONDS);
  const quickMatchPlayersRef = useRef(quickMatchPlayers);
  const departedQuickMatchPlayersRef = useRef(new Set<string>());
  const quickMatchWaitingRef = useRef(quickMatchWaiting);
  const quickMatchLobbyIdRef = useRef(quickMatchLobbyId);
  const quickMatchQueueChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const quickMatchLobbyChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const quickMatchPresenceChannelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  visibleFriendsRef.current = visibleFriends;
  quickMatchPlayersRef.current = quickMatchPlayers;
  quickMatchWaitingRef.current = quickMatchWaiting;
  quickMatchLobbyIdRef.current = quickMatchLobbyId;

  useEffect(() => {
    if (!incomingInvitation) return;
    window.dispatchEvent(new Event("hide-gold-counter-notification"));
    return () => {
      window.dispatchEvent(new Event("show-gold-counter-notification"));
    };
  }, [incomingInvitation]);

  useEffect(() => {
    const client = supabase;
    if (!client || !user?.id) {
      setIncomingInvitation(null);
      return;
    }

    let active = true;
    const presentInvitation = (invitation: GameInvitation) => {
      if (invitation.status !== "pending") return;
      setIncomingInvitation((current) => current?.invitation.id === invitation.id ? current : {
        invitation,
        sender: { id: invitation.sender_id, name: "هاوڕێ", avatar: "" },
        maxPlayers: 4,
      });
      void client
        .from("game_invitations")
        .select("id, lobby_id, sender_id, receiver_id, status, sender:profiles!game_invitations_sender_id_fkey(id, username, display_name, avatar_url), lobby:game_lobbies!game_invitations_lobby_id_fkey(max_players)")
        .eq("id", invitation.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!active || !data || data.status !== "pending") return;
          const senderRow = Array.isArray(data.sender) ? data.sender[0] : data.sender;
          const lobbyRow = Array.isArray(data.lobby) ? data.lobby[0] : data.lobby;
          if (!senderRow || !lobbyRow) return;
          setIncomingInvitation((current) => current?.invitation.id === invitation.id ? {
            invitation: data as unknown as GameInvitation,
            sender: {
              id: senderRow.id,
              name: senderRow.display_name ?? senderRow.username ?? "هاوڕێ",
              avatar: senderRow.avatar_url ?? "",
            },
            maxPlayers: lobbyRow.max_players === 2 || lobbyRow.max_players === 3 ? lobbyRow.max_players : 4,
          } : current);
        });
    };

    const loadPendingInvitation = () => {
      void client
        .from("game_invitations")
        .select("id, lobby_id, sender_id, receiver_id, status")
        .eq("receiver_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (active && data) presentInvitation(data as GameInvitation);
        });
    };

    const channel = client
      .channel(`game-invitations-receiver:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_invitations", filter: `receiver_id=eq.${user.id}` },
        ({ new: row }) => presentInvitation(row as GameInvitation),
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") loadPendingInvitation();
        else if (error) console.warn("Lobby invitation realtime connection error:", error.message);
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const client = supabase;
    if (!client || !user?.id) return;
    const channel = client
      .channel(`game-invitations-sender:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_invitations", filter: `sender_id=eq.${user.id}` },
        ({ new: row }) => {
          const invitation = row as GameInvitation;
          if (invitation.status !== "declined") return;
          const friend = visibleFriendsRef.current.find((item) => item.id === invitation.receiver_id);
          const name = friend?.name ?? "هاوڕێکەت";
          window.dispatchEvent(new Event("hide-gold-counter-notification"));
          toast.success(`${name} نایێت`, {
            duration: 2600,
            className: "border border-emerald-500/30 bg-emerald-900/90 text-emerald-100",
            style: { background: "rgba(6,78,59,.94)", color: "#d1fae5", border: "1px solid rgba(16,185,129,.3)" },
          });
          window.setTimeout(() => window.dispatchEvent(new Event("show-gold-counter-notification")), 2700);
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [user?.id]);

  const openFriendsLobby = async () => {
    if (!supabase || !user?.id) {
      toast.error("بۆ بانگهێشتکردنی هاوڕێ پێویستە بچیتە ژوورەوە");
      return;
    }
    const { data: lobby, error: lobbyError } = await supabase
      .from("game_lobbies")
      .insert({ host_id: user.id, max_players: 4 })
      .select("id, host_id, max_players")
      .single();
    if (lobbyError || !lobby) {
      toast.error("نەتوانرا ژووری یاری دروست بکرێت");
      return;
    }
    const { error: memberError } = await supabase
      .from("lobby_players")
      .insert({ lobby_id: lobby.id, user_id: user.id, token_url: selectedToken?.image_url ?? null });
    if (memberError) {
      await supabase.from("game_lobbies").delete().eq("id", lobby.id);
      toast.error("نەتوانرا بە ژووری یاری پەیوەست ببیت");
      return;
    }
    const hostMember: LobbyMember = {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      ...(selectedToken?.image_url ? { token_url: selectedToken.image_url } : {}),
      isHost: true,
    };
    setLobbySession({ id: lobby.id, hostId: lobby.host_id, maxPlayers: 4, isHost: true });
    setLobbyMembers([hostMember]);
    setFriendsLobbyOpen(true);
  };

  const clearLobbyState = () => {
    if (typeof window !== "undefined") {
      for (const storage of [window.localStorage, window.sessionStorage]) {
        storage.removeItem("active_lobby_id");
        storage.removeItem("active_quick_match_lobby");
      }
    }
    setFriendsLobbyOpen(false);
    setConfirmDisband(false);
    setLobbySession(null);
    setLobbyMembers([]);
    setLobbyMatch(null);
  };

  const startSharedMatch = useCallback((match: LobbyMatchConfig) => {
    setLobbyMatch((current) => current?.gameId === match.gameId ? current : match);
    setLobbySession({
      id: match.lobbyId,
      hostId: match.hostId,
      maxPlayers: match.players.length === 2 || match.players.length === 3 ? match.players.length : 4,
      isHost: match.hostId === user?.id,
    });
    setQuickMatchWaiting(false);
    setQuickMatchPlayers([]);
    setFriendsLobbyOpen(false);
    setPlaying(true);
    window.dispatchEvent(new Event("hide-gold-counter"));
  }, [user?.id]);

  const launchQuickMatchIfEligible = useCallback((
    status: string,
    match: LobbyMatchConfig | null | undefined,
  ) => {
    if (!match || !quickMatchWaitingRef.current || quickMatchCancelRequested.current) return false;
    const activePlayers = quickMatchPlayersRef.current
      .filter((player) => !departedQuickMatchPlayersRef.current.has(player.id))
      .slice(0, 4);
    const playerCount = activePlayers.length;
    const serverStartedMatch = status === "matched" || status === "in_progress";
    if (!serverStartedMatch || quickMatchCountdownRef.current > 0 || playerCount < 2) return false;
    startSharedMatch({ ...match, players: activePlayers });
    return true;
  }, [startSharedMatch]);

  const leaveQuickMatchRpc = useCallback(async (lobbyId: string | null) => {
    if (!supabase || !user?.id) return false;
    const { error } = await supabase.rpc("leave_quick_match", {
      p_lobby_id: lobbyId,
      p_player_id: user.id,
    });
    if (error) {
      console.error("Quick match leave failed:", error);
      return false;
    }
    return true;
  }, [user?.id]);

  const clearQuickMatchLocalState = useCallback(() => {
    if (typeof window !== "undefined") {
      for (const storage of [window.localStorage, window.sessionStorage]) {
        storage.removeItem("active_lobby_id");
        storage.removeItem("active_quick_match_lobby");
      }
    }
    setQuickMatchWaiting(false);
    setQuickMatchPlayers([]);
    setQuickMatchLobbyId(null);
    setQuickMatchLobbyCreatedAt(null);
    departedQuickMatchPlayersRef.current.clear();
    quickMatchCountdownRef.current = QUICK_MATCH_COUNTDOWN_SECONDS;
    setQuickMatchCountdown(QUICK_MATCH_COUNTDOWN_SECONDS);
  }, []);

  const removeQuickMatchChannels = useCallback(() => {
    if (!supabase) return;
    const channels = [
      quickMatchQueueChannelRef.current,
      quickMatchLobbyChannelRef.current,
      quickMatchPresenceChannelRef.current,
    ];
    quickMatchQueueChannelRef.current = null;
    quickMatchLobbyChannelRef.current = null;
    quickMatchPresenceChannelRef.current = null;
    for (const channel of channels) {
      if (channel) void supabase.removeChannel(channel);
    }
  }, []);

  const applyQuickMatchRoster = useCallback((players: LobbyPlayer[], restoreRejoinedPlayers = false) => {
    if (restoreRejoinedPlayers) {
      players.forEach((player) => departedQuickMatchPlayersRef.current.delete(player.id));
    }
    const activePlayers = players.filter((player) => !departedQuickMatchPlayersRef.current.has(player.id));
    quickMatchPlayersRef.current = activePlayers;
    setQuickMatchPlayers(activePlayers);
    return activePlayers;
  }, []);

  useEffect(() => () => {
    if (!quickMatchWaitingRef.current) return;
    const presenceChannel = quickMatchPresenceChannelRef.current;
    if (presenceChannel) void presenceChannel.untrack();
    removeQuickMatchChannels();
    void leaveQuickMatchRpc(quickMatchLobbyIdRef.current);
  }, [leaveQuickMatchRpc, removeQuickMatchChannels]);

  const tryStartQuickMatch = useCallback(async () => {
    const client = supabase;
    if (!client || !user?.id || quickMatchStartPending.current || !quickMatchWaitingRef.current || quickMatchCancelRequested.current) return;
    quickMatchStartPending.current = true;
    try {
      const { data, error } = await client.rpc("start_quick_match");
      if (error) {
        console.error("Quick match start check failed:", error);
        if (error.code === "PGRST202") {
          toast.error("Quick match database function is missing. Apply the matchmaking SQL migration in Supabase.");
        }
        return;
      }
      const result = data as QuickMatchQueueResult;
      if (result.match_config?.players) applyQuickMatchRoster(result.match_config.players, true);
      if (result.match_config?.lobbyId) setQuickMatchLobbyId(result.match_config.lobbyId);
      if (result.lobby_created_at) setQuickMatchLobbyCreatedAt(result.lobby_created_at);
      launchQuickMatchIfEligible(result.status, result.match_config);
    } finally {
      quickMatchStartPending.current = false;
    }
  }, [launchQuickMatchIfEligible, applyQuickMatchRoster, user?.id]);

  const startLobbyGame = async (members: LobbyMember[]) => {
    if (!supabase || !lobbySession?.isHost || members.length < 2) return;
    const gameId = crypto.randomUUID();
    const match: LobbyMatchConfig = {
      gameId,
      lobbyId: lobbySession.id,
      hostId: lobbySession.hostId,
      board: { ...selectedBoard },
      players: members.slice(0, lobbySession.maxPlayers).map((member) => ({
        id: member.id,
        name: member.name,
        avatar: member.avatar,
        ...(member.token_url ? { token_url: member.token_url } : {}),
      })),
    };
    const { data: updatedLobby, error } = await supabase
      .from("game_lobbies")
      .update({ status: "in_progress", game_id: gameId, match_config: match })
      .eq("id", lobbySession.id)
      .eq("host_id", user?.id)
      .eq("status", "waiting")
      .select("game_id")
      .maybeSingle();
    if (error || !updatedLobby) {
      toast.error("نەتوانرا یاری دەست پێ بکات");
      console.error("Lobby start failed:", error ?? "Lobby is no longer waiting");
      return;
    }
    startSharedMatch(match);
  };

  const joinQuickMatch = async () => {
    if (!supabase || !user?.id || quickMatchWaiting || playing || quickMatchJoinPending.current) return;
    if (typeof window !== "undefined") {
      for (const storage of [window.localStorage, window.sessionStorage]) {
        storage.removeItem("active_lobby_id");
        storage.removeItem("active_quick_match_lobby");
      }
    }
    quickMatchJoinPending.current = true;
    quickMatchCancelRequested.current = false;
    departedQuickMatchPlayersRef.current.clear();
    const localPlayer = {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      ...(selectedToken?.image_url ? { token_url: selectedToken.image_url } : {}),
    };
    quickMatchPlayersRef.current = [localPlayer];
    quickMatchCountdownRef.current = QUICK_MATCH_COUNTDOWN_SECONDS;
    setQuickMatchCountdown(QUICK_MATCH_COUNTDOWN_SECONDS);
    setQuickMatchLobbyId(null);
    setQuickMatchLobbyCreatedAt(null);
    setQuickMatchPlayers([localPlayer]);
    setQuickMatchWaiting(true);
    try {
      const previousQueueCleared = await leaveQuickMatchRpc(null);
      if (!previousQueueCleared) {
        setQuickMatchWaiting(false);
        setQuickMatchPlayers([]);
        toast.error("نەتوانرا گەڕانی پێشووی یاری پاک بکرێتەوە");
        return;
      }
      if (quickMatchCancelRequested.current) return;

      const { data, error } = await supabase.rpc("find_or_create_quick_match", {
        requested_board: normalizeBoardSkin(selectedBoard),
        requested_token_url: selectedToken?.image_url ?? null,
      });
      if (quickMatchCancelRequested.current) {
        await leaveQuickMatchRpc(null);
        return;
      }
      if (error) {
        setQuickMatchWaiting(false);
        console.error("Quick match queue failed:", error);
        toast.error("نەتوانرا یاریزان بدۆزرێتەوە");
        return;
      }
      const result = data as QuickMatchQueueResult;
      const lobbyId = result.match_config?.lobbyId;
      if (lobbyId) {
        setQuickMatchLobbyId(lobbyId);
        const { data: lobby } = await supabase
          .from("game_lobbies")
          .select("created_at, status, match_config")
          .eq("id", lobbyId)
          .maybeSingle();
        if (quickMatchCancelRequested.current) {
          await leaveQuickMatchRpc(lobbyId);
          return;
        }
        if (lobby?.created_at) {
          setQuickMatchLobbyCreatedAt(lobby.created_at);
          const remaining = Math.max(
            0,
            QUICK_MATCH_COUNTDOWN_SECONDS - Math.floor((Date.now() - new Date(lobby.created_at).getTime()) / 1000),
          );
          quickMatchCountdownRef.current = remaining;
          setQuickMatchCountdown(remaining);
        }
        if (lobby?.status === "in_progress" && lobby.match_config) {
          void tryStartQuickMatch();
          return;
        }
      }
      if (result.match_config?.players) applyQuickMatchRoster(result.match_config.players, true);
      if ((result.match_config?.players.length ?? 0) === 4 || result.status === "matched") {
        launchQuickMatchIfEligible(result.status, result.match_config);
        if (result.status !== "matched") void tryStartQuickMatch();
        return;
      }
    } finally {
      quickMatchJoinPending.current = false;
    }
  };

  useEffect(() => {
    const client = supabase;
    if (!quickMatchWaiting || !client || !user?.id) return;
    let active = true;
    const acceptQueueUpdate = (status: string, config: LobbyMatchConfig | null | undefined) => {
      if (!active || !config || (status !== "waiting" && status !== "matched")) return;
      if (config.lobbyId) setQuickMatchLobbyId(config.lobbyId);
      if (status === "matched") {
        void tryStartQuickMatch();
        return;
      }
      if (config.players?.length === 4) {
        void tryStartQuickMatch();
        return;
      }
      if (launchQuickMatchIfEligible(status, config)) return;
    };
    const refreshOwnQueue = () => {
      void client
        .from("quick_match_queue")
        .select("status, match_config")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data: queueRow }) => {
          if (queueRow) acceptQueueUpdate(queueRow.status, queueRow.match_config as LobbyMatchConfig | null);
        });
    };
    const handleQueueDelete = (oldRow: Record<string, unknown>) => {
      const departedId = typeof oldRow["user_id"] === "string" ? oldRow["user_id"] : null;
      const deletedLobbyId = typeof oldRow["lobby_id"] === "string" ? oldRow["lobby_id"] : null;
      if (
        !departedId
        || (deletedLobbyId && quickMatchLobbyId && deletedLobbyId !== quickMatchLobbyId)
      ) return;
      departedQuickMatchPlayersRef.current.add(departedId);
      const activePlayers = quickMatchPlayersRef.current.filter((player) => player.id !== departedId);
      quickMatchPlayersRef.current = activePlayers;
      setQuickMatchPlayers(activePlayers);
      refreshOwnQueue();
    };
    const channel = client
      .channel(`quick-match:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quick_match_queue", filter: `user_id=eq.${user.id}` },
        ({ new: row }) => {
          const queueRow = row as { status: string; match_config?: LobbyMatchConfig | null };
          acceptQueueUpdate(queueRow.status, queueRow.match_config);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quick_match_queue", filter: `user_id=eq.${user.id}` },
        ({ new: row }) => {
          const queueRow = row as { status: string; match_config?: LobbyMatchConfig | null };
          acceptQueueUpdate(queueRow.status, queueRow.match_config);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "quick_match_queue" },
        ({ old: row }) => handleQueueDelete(row as Record<string, unknown>),
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        refreshOwnQueue();
      });
    quickMatchQueueChannelRef.current = channel;
    return () => {
      active = false;
      if (quickMatchQueueChannelRef.current === channel) {
        quickMatchQueueChannelRef.current = null;
        void client.removeChannel(channel);
      }
    };
  }, [quickMatchWaiting, launchQuickMatchIfEligible, tryStartQuickMatch, user?.id]);

  useEffect(() => {
    const client = supabase;
    if (!quickMatchWaiting || !client || !quickMatchLobbyId) return;
    let active = true;
    const applyLobbySnapshot = (row: {
      created_at: string;
      status: string;
      match_config: LobbyMatchConfig | null;
    }, queueRows: Array<{ user_id: string; status: string }>) => {
      if (!active) return;
      setQuickMatchLobbyCreatedAt(row.created_at);
      const activeIds = new Set(
        queueRows
          .filter((queueRow) => queueRow.status === "waiting" || queueRow.status === "matched")
          .map((queueRow) => queueRow.user_id),
      );
      const databaseRoster = Array.isArray(row.match_config?.players)
        ? row.match_config.players.filter((player) => activeIds.has(player.id))
        : [];
      applyQuickMatchRoster(databaseRoster, true);
      if (row.status === "in_progress" && !launchQuickMatchIfEligible(row.status, row.match_config)) {
        void tryStartQuickMatch();
      }
    };
    const refreshLobbySnapshot = () => {
      void Promise.all([
        client
          .from("game_lobbies")
          .select("created_at, status, match_config")
          .eq("id", quickMatchLobbyId)
          .maybeSingle(),
        client
          .from("quick_match_queue")
          .select("user_id, status")
          .eq("lobby_id", quickMatchLobbyId),
      ]).then(([{ data: lobby }, { data: queueRows }]) => {
        if (lobby) {
          applyLobbySnapshot(lobby as {
            created_at: string;
            status: string;
            match_config: LobbyMatchConfig | null;
          }, queueRows ?? []);
        }
      });
    };
    const channel = client
      .channel(`quick-match-lobby:${quickMatchLobbyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_lobbies", filter: `id=eq.${quickMatchLobbyId}` },
        refreshLobbySnapshot,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lobby_players", filter: `lobby_id=eq.${quickMatchLobbyId}` },
        refreshLobbySnapshot,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quick_match_queue", filter: `lobby_id=eq.${quickMatchLobbyId}` },
        refreshLobbySnapshot,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quick_match_queue", filter: `lobby_id=eq.${quickMatchLobbyId}` },
        refreshLobbySnapshot,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "quick_match_queue" },
        ({ old: row }) => {
          if (row["lobby_id"] === quickMatchLobbyId) refreshLobbySnapshot();
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        refreshLobbySnapshot();
      });
    quickMatchLobbyChannelRef.current = channel;
    return () => {
      active = false;
      if (quickMatchLobbyChannelRef.current === channel) {
        quickMatchLobbyChannelRef.current = null;
        void client.removeChannel(channel);
      }
    };
  }, [quickMatchWaiting, quickMatchLobbyId, applyQuickMatchRoster, launchQuickMatchIfEligible, tryStartQuickMatch]);

  useEffect(() => {
    const client = supabase;
    if (!quickMatchWaiting || !client || !quickMatchLobbyId || !user?.id) return;
    let active = true;
    let tracked = false;
    const channel = client.channel(`quick-match-presence:${quickMatchLobbyId}`, {
      config: { presence: { key: user.id } },
    });
    channel.on("presence", { event: "sync" }, () => {
      if (!active || !tracked) return;
      const players = Object.values(channel.presenceState())
        .flatMap((entries) => entries as Array<{ player?: LobbyPlayer }>)
        .map((entry) => entry.player)
        .filter((player): player is LobbyPlayer => Boolean(
          player?.id && !departedQuickMatchPlayersRef.current.has(player.id),
        ));
      const uniquePlayers = [...new Map(players.map((player) => [player.id, player])).values()];
      const knownPlayers = new Map(quickMatchPlayersRef.current.map((player) => [player.id, player]));
      uniquePlayers.forEach((player) => knownPlayers.set(player.id, player));
      applyQuickMatchRoster([...knownPlayers.values()]);
    });
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED" || !active) return;
      const player = quickMatchPlayersRef.current.find((item) => item.id === user.id);
      if (!player) return;
      void channel.track({ player }).then(() => {
        tracked = true;
        const players = Object.values(channel.presenceState())
          .flatMap((entries) => entries as Array<{ player?: LobbyPlayer }>)
          .map((entry) => entry.player)
          .filter((entry): entry is LobbyPlayer => Boolean(
            entry?.id && !departedQuickMatchPlayersRef.current.has(entry.id),
          ));
        const uniquePlayers = [...new Map(players.map((entry) => [entry.id, entry])).values()];
        const knownPlayers = new Map(quickMatchPlayersRef.current.map((entry) => [entry.id, entry]));
        uniquePlayers.forEach((entry) => knownPlayers.set(entry.id, entry));
        applyQuickMatchRoster([...knownPlayers.values()]);
      });
    });
    quickMatchPresenceChannelRef.current = channel;
    return () => {
      active = false;
      if (quickMatchPresenceChannelRef.current === channel) {
        quickMatchPresenceChannelRef.current = null;
        void client.removeChannel(channel);
      }
    };
  }, [quickMatchWaiting, quickMatchLobbyId, applyQuickMatchRoster, user?.id]);

  useEffect(() => {
    if (!quickMatchWaiting || !quickMatchLobbyCreatedAt) return;
    const syncCountdown = () => {
      const createdAtMs = new Date(quickMatchLobbyCreatedAt).getTime();
      if (!Number.isFinite(createdAtMs)) return;
      const remainingSeconds = Math.max(
        0,
        QUICK_MATCH_COUNTDOWN_SECONDS - Math.floor((Date.now() - createdAtMs) / 1000),
      );
      quickMatchCountdownRef.current = remainingSeconds;
      setQuickMatchCountdown(remainingSeconds);
      if (remainingSeconds === 0 && quickMatchLobbyId) {
        const activePlayers = quickMatchPlayersRef.current.filter(
          (player) => !departedQuickMatchPlayersRef.current.has(player.id),
        );
        if (activePlayers.length < 2) {
          const resetAt = new Date().toISOString();
          quickMatchCountdownRef.current = QUICK_MATCH_COUNTDOWN_SECONDS;
          setQuickMatchCountdown(QUICK_MATCH_COUNTDOWN_SECONDS);
          setQuickMatchLobbyCreatedAt(resetAt);
        }
        void tryStartQuickMatch();
      }
    };
    syncCountdown();
    const timer = window.setInterval(syncCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [quickMatchWaiting, quickMatchLobbyCreatedAt, quickMatchLobbyId, tryStartQuickMatch]);

  const cancelQuickMatch = async () => {
    quickMatchCancelRequested.current = true;
    const lobbyId = quickMatchLobbyId;
    const presenceChannel = quickMatchPresenceChannelRef.current;
    if (presenceChannel) void presenceChannel.untrack();
    clearQuickMatchLocalState();
    removeQuickMatchChannels();
    await leaveQuickMatchRpc(lobbyId);
  };

  const exitLobby = async () => {
    if (!lobbySession) return;
    if (lobbySession.isHost) {
      setConfirmDisband(true);
      return;
    }
    if (supabase && user?.id) {
      const { error } = await supabase
        .from("lobby_players")
        .delete()
        .eq("lobby_id", lobbySession.id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("نەتوانرا لە ژوورەکە بچیتە دەرەوە");
        return;
      }
    }
    clearLobbyState();
  };

  const confirmLobbyDisband = async () => {
    if (!supabase || !user?.id || !lobbySession?.isHost) return;
    const { error } = await supabase
      .from("game_lobbies")
      .update({ status: "disbanded" })
      .eq("id", lobbySession.id)
      .eq("host_id", user.id);
    if (error) {
      toast.error("نەتوانرا ژوورەکە تێک بدرێت");
      return;
    }
    clearLobbyState();
    window.dispatchEvent(new Event("show-gold-counter"));
  };

  const finishLobby = async () => {
    if (typeof window !== "undefined") localStorage.removeItem("active_quick_match_lobby");
    if (supabase && lobbySession && user?.id) {
      if (lobbySession.isHost) {
        await supabase.from("game_lobbies").update({ status: "finished" }).eq("id", lobbySession.id).eq("host_id", user.id);
      } else {
        await supabase.from("lobby_players").delete().eq("lobby_id", lobbySession.id).eq("user_id", user.id);
      }
      await leaveQuickMatchRpc(lobbySession.id);
    }
    clearLobbyState();
    setPlaying(false);
    window.dispatchEvent(new Event("show-gold-counter"));
  };

  const handleRemoteLobbyDisband = useCallback(() => {
    clearLobbyState();
    setPlaying(false);
    window.dispatchEvent(new Event("show-gold-counter"));
    toast.message("ژوورەکە لەلایەن خاوەن ژوورەوە تێکدرا.", { duration: 2800 });
  }, []);

  const respondToIncomingInvitation = async (response: "accepted" | "declined") => {
    if (!supabase || !user?.id || !incomingInvitation || respondingToInvitation) return;
    setRespondingToInvitation(true);
    const invite = incomingInvitation;
    const { error } = await supabase.rpc("respond_to_game_invitation", {
      invitation_id: invite.invitation.id,
      response,
    });
    setRespondingToInvitation(false);
    if (error) {
      toast.error(response === "accepted" ? "نەتوانرا بانگهێشتەکە قبوڵ بکرێت" : "نەتوانرا وەڵامی بانگهێشتەکە بنێردرێت");
      return;
    }
    setIncomingInvitation(null);
    if (response === "declined") return;

    if (selectedToken?.image_url) {
      await supabase
        .from("lobby_players")
        .update({ token_url: selectedToken.image_url })
        .eq("lobby_id", invite.invitation.lobby_id)
        .eq("user_id", user.id);
    }

    const { data: lobby, error: lobbyError } = await supabase
      .from("game_lobbies")
      .select("id, host_id, max_players")
      .eq("id", invite.invitation.lobby_id)
      .single();
    if (lobbyError || !lobby) {
      toast.error("نەتوانرا ژووری هاوڕێکەت بکرێتەوە");
      return;
    }
    const members = await loadLobbyMembers(lobby.id, lobby.host_id);
    setLobbySession({
      id: lobby.id,
      hostId: lobby.host_id,
      maxPlayers: lobby.max_players === 2 || lobby.max_players === 3 ? lobby.max_players : 4,
      isHost: false,
    });
    setLobbyMembers(members);
    setFriendsLobbyOpen(true);
  };

  const allBoards = [...defaultBoards, ...customBoards];
  const allTokens = [...defaultTokens, ...customTokens];
  const selectedBoardSource = allBoards.find((board) => board.id === boardId) ?? allBoards[0] ?? QUICK_MATCH_DEFAULT_BOARD;
  const selectedBoard = {
    ...normalizeBoardSkin(selectedBoardSource),
    ...(typeof selectedBoardSource.image_url === "string" ? { image_url: selectedBoardSource.image_url } : {}),
  };
  const selectedToken = allTokens.find((token) => token.id === tokenId);

  return (
    <>
      <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md mx-auto gap-3 py-2 -translate-y-8 z-10">
        <img
          src="/king1.png"
          alt="Snakes and Ladders"
          className="w-[80%] max-w-[310px] h-auto object-contain mt-4 mb-1 drop-shadow-2xl pointer-events-none"
        />
        <div className="my-3 grid w-full max-w-[360px] grid-cols-4 items-center gap-3 mx-auto z-10">
          {/* Board */}
          <button
            onClick={onOpenBoard}
            className="flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden border-0 bg-transparent p-0 outline-none focus:outline-none cursor-pointer"
          >
            <img src="/baso1.png" alt="تەختە" className="size-[88%] object-contain block select-none drop-shadow-md transition-transform active:scale-95" />
          </button>
          {/* Sticker */}
          <button
            onClick={onOpenSticker}
            className="flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden border-0 bg-transparent p-0 outline-none focus:outline-none cursor-pointer"
          >
            <img src="/baso2.png" alt="ستیکەر" className="size-[88%] object-contain block select-none drop-shadow-md transition-transform active:scale-95" />
          </button>
          {/* Sound */}
          <button
            onClick={onOpenSound}
            className="flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden border-0 bg-transparent p-0 outline-none focus:outline-none cursor-pointer"
          >
            <img src="/baso3.png" alt="ساوند" className="size-[88%] object-contain block select-none drop-shadow-md transition-transform active:scale-95" />
          </button>
          {/* Coins */}
          <button
            onClick={onOpenToken}
            className="flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden border-0 bg-transparent p-0 outline-none focus:outline-none cursor-pointer"
          >
            <img src="/baso4.png" alt="پووڵ" className="size-[88%] object-contain block select-none drop-shadow-md transition-transform active:scale-95" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-3 w-full mt-2">
          <button
            type="button"
            onClick={() => void joinQuickMatch()}
            disabled={quickMatchWaiting}
            aria-label="Play Random"
            style={{ clipPath: "inset(8% 3% 8% 3% round 24px)" }}
            className="m-0 block h-fit w-[80%] max-w-[300px] shrink-0 cursor-pointer select-none touch-manipulation border-0 bg-transparent p-0 outline-none shadow-lg transition-all duration-300 ease-out hover:scale-[1.02] active:scale-95 focus:outline-none"
          >
            <img
              src="/kingv.png"
              className="block h-auto w-full object-contain drop-shadow-xl pointer-events-none select-none"
              alt="Play Random"
            />
          </button>
          <button
            type="button"
            onClick={() => void openFriendsLobby()}
            aria-label="یاری لەگەڵ هاوڕێکان"
            style={{ clipPath: "inset(8% 3% 8% 3% round 24px)" }}
            className="m-0 block h-fit w-[80%] max-w-[300px] shrink-0 cursor-pointer select-none touch-manipulation border-0 bg-transparent p-0 outline-none shadow-lg transition-all duration-300 ease-out hover:scale-[1.02] active:scale-95 focus:outline-none"
          >
            <img
              src="/king2.png"
              className="block h-auto w-full object-contain drop-shadow-xl pointer-events-none select-none"
              alt="یاری لەگەڵ هاوڕێکان"
            />
          </button>
        </div>
      </div>

      {quickMatchWaiting && typeof document !== "undefined" && createPortal((
        <div className="fixed inset-0 z-[9999] flex min-h-dvh flex-col overflow-y-auto bg-black/90 text-white backdrop-blur-md">
          <div className="pointer-events-none absolute inset-0 opacity-35" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(217,164,65,.24), transparent 48%), radial-gradient(ellipse at 10% 90%, rgba(16,185,129,.18), transparent 42%)" }} />
          <button
            type="button"
            onClick={() => void cancelQuickMatch()}
            aria-label="Cancel matchmaking"
            title="Cancel matchmaking"
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 grid size-11 place-items-center rounded-full border border-red-300/35 bg-red-500/15 text-red-100 transition hover:bg-red-500/30 active:scale-95"
          >
            <X className="size-5" />
          </button>
          <main className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-1 flex-col items-center px-5 pb-8 pt-[max(2rem,env(safe-area-inset-top))]">
            <header className="mt-4 text-center">
              <p className="text-xs font-bold uppercase text-amber-200/65">Quick Match</p>
              <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">دۆزینەوەی یاریزان</h1>
              <p className="mt-1 text-sm font-semibold text-emerald-50/60">Finding Opponents</p>
            </header>

            <div className="mt-7 grid size-36 shrink-0 place-items-center sm:mt-8 sm:size-40">
              <svg className="col-start-1 row-start-1 size-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="6" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="#f3c969"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={String(2 * Math.PI * 52)}
                  strokeDashoffset={String(2 * Math.PI * 52 * (1 - quickMatchCountdown / QUICK_MATCH_COUNTDOWN_SECONDS))}
                  className="transition-[stroke-dashoffset] duration-500"
                />
              </svg>
              <div className="col-start-1 row-start-1 text-center">
                <span className="block text-5xl font-black tabular-nums text-amber-100">{quickMatchCountdown}</span>
                <span className="mt-1 block text-[10px] font-bold text-white/45">چرکە</span>
              </div>
            </div>

            <section className="mt-8 w-full" aria-label="Quick match player slots">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                {Array.from({ length: 4 }, (_, slotIndex) => {
                  const localPlayer = quickMatchPlayers.find((player) => player.id === user?.id) ?? {
                    id: user?.id ?? "me",
                    name: user?.name ?? "من",
                    avatar: user?.avatar ?? "",
                    ...(selectedToken?.image_url ? { token_url: selectedToken.image_url } : {}),
                  };
                  const opponents = quickMatchPlayers.filter((player) => player.id !== user?.id);
                  const player = slotIndex === 0 ? localPlayer : opponents[slotIndex - 1];
                  return (
                    <div
                      key={player?.id ?? `waiting-slot-${slotIndex}`}
                      className={`flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border px-3 py-4 text-center transition-all duration-500 ${player ? "border-amber-200/35 bg-white/[.07] shadow-[0_0_24px_rgba(243,201,105,.08)] animate-in fade-in zoom-in-95" : "border-dashed border-emerald-100/20 bg-black/20"}`}
                    >
                      {player ? (
                        <>
                          <div className="relative size-16 rounded-full border-2 border-amber-200/65 bg-emerald-950 p-0.5 shadow-[0_0_18px_rgba(243,201,105,.18)]">
                            <img src={avatarImageSource(player.avatar)} alt={player.name} className="size-full rounded-full object-cover" />
                            {player.token_url && (
                              <img src={avatarImageSource(player.token_url)} alt="Pawn" className="absolute -bottom-1 -right-2 size-7 rounded-full border border-amber-200/70 bg-emerald-950 object-cover" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold">{player.name}</p>
                            <p className="mt-1 text-[10px] font-bold text-emerald-200/60">{slotIndex === 0 ? "تۆ" : "یاریزانی ئۆنلاین"}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid size-14 place-items-center rounded-full border border-dashed border-emerald-200/30 bg-emerald-400/[.06] animate-pulse">
                            <Users className="size-6 text-emerald-100/40" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white/55">چاوەڕوانی یاریزان...</p>
                            <p className="mt-1 text-[10px] text-white/30">Searching...</p>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <p className="mt-5 text-center text-xs font-medium text-emerald-50/45">
              {quickMatchPlayers.length} / 4 یاریزان
            </p>

            <div className="mt-auto flex w-full justify-center pt-8">
              <button
                type="button"
                onClick={() => void cancelQuickMatch()}
                className="flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-red-300/45 bg-red-600/80 px-5 text-sm font-extrabold text-white shadow-lg shadow-red-950/30 transition hover:border-red-200 hover:bg-red-500 active:scale-[.98]"
              >
                <X className="size-4" />
                پاشگەزبوونەوە / Cancel Search
              </button>
            </div>
          </main>
        </div>
      ), document.body)}

      {playing && (
        <SnakesGame
          board={lobbyMatch?.board ?? selectedBoard}
          me={{
            name: user?.name ?? "من",
            avatar: user?.avatar ?? "",
            token_url: selectedToken?.image_url ?? (user as any)?.token_url,
          }}
          stickers={stickers}
          {...(lobbyMatch ? { initialPlayers: lobbyMatch.players, matchId: lobbyMatch.gameId } : {})}
          onClose={() => {
            setPlaying(false);
            if (lobbySession) void finishLobby();
            else setLobbyMatch(null);
            window.dispatchEvent(new Event("show-gold-counter"));
          }}
        />
      )}
      {friendsLobbyOpen && (
        <FriendsPlayOverlay
          friends={visibleFriends}
          currentUser={{ id: user?.id ?? "me", name: user?.name ?? "من", avatar: user?.avatar ?? "" }}
          session={lobbySession!}
          initialMembers={lobbyMembers}
          onClose={() => void exitLobby()}
          onMembersChange={setLobbyMembers}
          onStart={startLobbyGame}
          onMatchStart={startSharedMatch}
          onDisband={handleRemoteLobbyDisband}
        />
      )}
      {confirmDisband && (
        <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <section role="alertdialog" aria-modal="true" aria-labelledby="disband-lobby-title" className="w-full max-w-sm rounded-2xl border border-amber-400/40 bg-emerald-950 p-5 text-center text-white shadow-2xl sm:p-6">
            <h2 id="disband-lobby-title" className="text-base font-extrabold leading-relaxed sm:text-lg">دڵنیایت دەتەوێت ژوورەکە تێک بدەی؟</h2>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button type="button" onClick={() => void confirmLobbyDisband()} className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white shadow-lg transition-all hover:bg-emerald-500 active:scale-95">بەڵێ</button>
              <button type="button" onClick={() => setConfirmDisband(false)} className="rounded-xl bg-slate-700/80 px-5 py-2.5 font-bold text-slate-200 transition-all hover:bg-slate-600 active:scale-95">نەخێر</button>
            </div>
          </section>
        </div>
      )}
      {incomingInvitation && (
        <>
          <style>{`@keyframes lobby-slide-down{from{opacity:0;transform:translate(-50%,-120%)}to{opacity:1;transform:translate(-50%,0)}}.animate-slide-down{animation:lobby-slide-down .32s cubic-bezier(.2,.8,.2,1) both}`}</style>
          <div className="animate-in slide-in-from-top-4 duration-300 fixed top-3 left-0 right-0 mx-auto z-[999999] box-border w-[calc(100%-1.5rem)] max-w-md bg-emerald-950/95 border border-emerald-500/50 backdrop-blur-xl rounded-2xl p-3 sm:p-4 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right text-white">
            <div className="flex min-w-0 w-full sm:flex-1 items-center justify-center sm:justify-start gap-3">
              <div className="size-11 shrink-0 overflow-hidden rounded-full border border-amber-300/45">
                <img src={avatarImageSource(incomingInvitation.sender.avatar)} alt={incomingInvitation.sender.name} className="size-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">هاوڕێکەت بانگهێشتت دەکات</p>
                <p className="mt-0.5 truncate break-words text-xs text-emerald-100/65">{incomingInvitation.sender.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center shrink-0">
              <button type="button" disabled={respondingToInvitation} onClick={() => void respondToIncomingInvitation("accepted")} className="flex-1 sm:flex-initial bg-amber-500/20 text-amber-300 border border-amber-400/70 hover:bg-amber-500/30 active:scale-95 px-4 py-2 rounded-xl text-xs font-bold transition-all text-center min-w-[70px] disabled:opacity-50">هاتم</button>
              <button type="button" disabled={respondingToInvitation} onClick={() => void respondToIncomingInvitation("declined")} className="flex-1 sm:flex-initial bg-red-500/20 text-red-400 border border-red-500/70 hover:bg-red-500/30 active:scale-95 px-4 py-2 rounded-xl text-xs font-bold transition-all text-center min-w-[70px] disabled:opacity-50">نایەم</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function FriendsPlayOverlay({
  friends,
  currentUser,
  session,
  initialMembers,
  onClose,
  onMembersChange,
  onStart,
  onMatchStart,
  onDisband,
}: {
  friends: Friend[];
  currentUser: LobbyPlayer;
  session: LobbySession;
  initialMembers: LobbyMember[];
  onClose: () => void;
  onMembersChange: (members: LobbyMember[]) => void;
  onStart: (members: LobbyMember[]) => void;
  onMatchStart: (match: LobbyMatchConfig) => void;
  onDisband: () => void;
}) {
  useHideChrome();
  const playerLimit = 4;
  const [members, setMembers] = useState<LobbyMember[]>(initialMembers);
  const [inviteStatus, setInviteStatus] = useState<Record<string, "sending" | "sent" | "joined" | "declined">>({});
  const [notice, setNotice] = useState("");
  const inviteResetTimers = useRef<Record<string, number>>({});
  const friendsListRef = useRef<HTMLDivElement>(null);
  const friendsRef = useRef(friends);
  const onMembersChangeRef = useRef(onMembersChange);
  const onMatchStartRef = useRef(onMatchStart);
  const onDisbandRef = useRef(onDisband);
  friendsRef.current = friends;
  onMembersChangeRef.current = onMembersChange;
  onMatchStartRef.current = onMatchStart;
  onDisbandRef.current = onDisband;

  useEffect(() => () => {
    Object.values(inviteResetTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const refreshMembers = async () => {
      const nextMembers = await loadLobbyMembers(session.id, session.hostId);
      if (!active) return;
      setMembers(nextMembers);
      onMembersChangeRef.current(nextMembers);
    };
    const memberChannel = client
      .channel(`lobby-members:${session.id}:${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lobby_players", filter: `lobby_id=eq.${session.id}` },
        () => void refreshMembers(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshMembers();
      });
    const lobbyChannel = client
      .channel(`lobby-lifecycle:${session.id}:${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_lobbies", filter: `id=eq.${session.id}` },
        ({ new: row }) => {
          const lobby = row as { status?: string; match_config?: LobbyMatchConfig | null };
          if (lobby.status === "in_progress" && lobby.match_config?.gameId) {
            onMatchStartRef.current(lobby.match_config);
          } else if (lobby.status === "disbanded") {
            onDisbandRef.current();
          }
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        void client
          .from("game_lobbies")
          .select("status, match_config")
          .eq("id", session.id)
          .maybeSingle()
          .then(({ data }) => {
            if (active && data?.status === "in_progress" && data.match_config?.gameId) {
              onMatchStartRef.current(data.match_config as LobbyMatchConfig);
            } else if (active && data?.status === "disbanded") {
              onDisbandRef.current();
            }
          });
      });
    const inviteChannel = client
      .channel(`lobby-invites-sent:${session.id}:${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_invitations", filter: `sender_id=eq.${currentUser.id}` },
        ({ new: row }) => {
          const invitation = row as GameInvitation;
          if (invitation.lobby_id !== session.id) return;
          if (invitation.status === "accepted") {
            setInviteStatus((status) => ({ ...status, [invitation.receiver_id]: "joined" }));
          } else if (invitation.status === "declined") {
            setInviteStatus((status) => ({ ...status, [invitation.receiver_id]: "declined" }));
            const declinedFriend = friendsRef.current.find((friend) => friend.id === invitation.receiver_id);
            if (declinedFriend) setNotice(`${declinedFriend.name} نایێت`);
            const existingTimer = inviteResetTimers.current[invitation.receiver_id];
            if (existingTimer) window.clearTimeout(existingTimer);
            inviteResetTimers.current[invitation.receiver_id] = window.setTimeout(() => {
              setInviteStatus((status) => {
                if (status[invitation.receiver_id] !== "declined") return status;
                const next = { ...status };
                delete next[invitation.receiver_id];
                return next;
              });
              delete inviteResetTimers.current[invitation.receiver_id];
            }, 100);
          }
        },
      )
      .subscribe();

    void client
      .from("game_invitations")
      .select("receiver_id, status")
      .eq("lobby_id", session.id)
      .eq("sender_id", currentUser.id)
      .then(({ data }) => {
        if (active && data) {
          setInviteStatus(Object.fromEntries(data.map((invitation) => [
            invitation.receiver_id,
            invitation.status === "accepted" ? "joined" : invitation.status === "declined" ? "declined" : "sent",
          ])));
        }
      });

    return () => {
      active = false;
      void client.removeChannel(memberChannel);
      void client.removeChannel(lobbyChannel);
      void client.removeChannel(inviteChannel);
    };
  }, [currentUser.id, session.hostId, session.id]);

  const inviteFriend = async (friend: Friend) => {
    if (!supabase || friend.status === "in_game" || members.length + pendingInviteCount >= playerLimit || inviteStatus[friend.id]) return;
    setInviteStatus((current) => ({ ...current, [friend.id]: "sent" }));
    const { error } = await supabase.from("game_invitations").insert({
      lobby_id: session.id,
      sender_id: currentUser.id,
      receiver_id: friend.id,
      status: "pending",
    });
    if (error) {
      setInviteStatus((current) => {
        const next = { ...current };
        delete next[friend.id];
        return next;
      });
      toast.error("نەتوانرا بانگهێشتەکە بنێردرێت");
      return;
    }
    setNotice(`${friend.name} بۆ ژووری یاری بانگهێشت کرا`);
  };

  const canStartGame = session.isHost && members.length >= 2;
  const pendingInviteCount = Object.values(inviteStatus).filter((status) => status === "sent" || status === "sending").length;
  const pendingFriends = friends.filter((friend) => inviteStatus[friend.id] === "sent" || inviteStatus[friend.id] === "sending");
  const occupiedSlots = Math.min(playerLimit, members.length + pendingFriends.length);
  const slotCount = Math.min(playerLimit, occupiedSlots + (occupiedSlots < playerLimit ? 1 : 0));
  const availableFriends = friends.filter((friend) => !members.some((member) => member.id === friend.id));
  const orderedFriends = [...availableFriends].sort(
    (first, second) => Number(second.online !== false) - Number(first.online !== false) || first.name.localeCompare(second.name),
  );

  return (
    <div className="fixed inset-2 sm:inset-3 z-[999999] bg-emerald-950/98 backdrop-blur-2xl border-2 sm:border-4 border-amber-500/80 rounded-[2rem] sm:rounded-[2.5rem] p-3 sm:p-6 flex flex-col justify-between overflow-y-auto text-white">
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-amber-950/40 via-emerald-950/90 to-black shadow-[inset_0_0_25px_rgba(245,158,11,0.12)]">
        <header className="flex shrink-0 items-center justify-between border-b border-amber-200/15 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Users className="size-5 text-amber-300" />
            <div>
              <h2 className="text-base font-extrabold sm:text-lg">یاری لەگەڵ هاوڕێکانت</h2>
              <p className="text-xs text-emerald-100/60">ژووری تایبەتی یاری</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="داخستن" className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-lg transition-all duration-300 ease-out hover:scale-[1.02] hover:border-amber-300/50 hover:bg-white/10 active:scale-95">
            <X className="size-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1.05fr_.95fr] lg:overflow-hidden">
          <section className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-amber-100">ژمارەی یاریزانان</h3>
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100">{members.length} / 4</span>
            </div>

            <div className={`grid gap-2 ${slotCount <= 2 ? "grid-cols-2" : slotCount === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
              {Array.from({ length: slotCount }, (_, slotIndex) => {
                const player = members[slotIndex];
                const pendingFriend = !player ? pendingFriends[slotIndex - members.length] : undefined;
                return (
                  <div key={slotIndex} className={`relative flex min-h-[142px] flex-col items-center justify-center rounded-xl border p-3 text-center shadow-lg transition-all duration-300 ease-out hover:scale-[1.02] active:scale-95 ${player ? "border-amber-300/35 bg-emerald-950/60" : "border-dashed border-emerald-100/20 bg-black/15"}`}>
                    {player?.isHost && <Crown className="absolute right-2 top-2 size-4 text-amber-300" />}
                    {player ? (
                      <div className="my-auto flex flex-col items-center justify-center gap-2 text-center">
                        <div className="relative size-14 overflow-hidden rounded-full border-2 border-amber-300/70 shadow-[0_0_18px_rgba(252,211,77,.16)]">
                          <img src={avatarImageSource(player.avatar)} alt={player.name} className="size-full object-cover" />
                          <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-[#0b261b] bg-emerald-400" />
                        </div>
                        <span className="max-w-full truncate text-sm font-bold">{player.name}</span>
                      </div>
                    ) : pendingFriend ? (
                      <div className="my-auto flex flex-col items-center justify-center gap-2 text-center">
                        <div className="relative size-14 overflow-hidden rounded-full border border-amber-300/30">
                          <img src={avatarImageSource(pendingFriend.avatar)} alt={pendingFriend.name} className="size-full object-cover" />
                          <span className="absolute inset-0 bg-emerald-950/45" />
                        </div>
                        <span className="max-w-full truncate text-sm font-bold">{pendingFriend.name}</span>
                        <span className="rounded-full border border-amber-300/30 bg-amber-300/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 animate-pulse">چاوەڕوانی...</span>
                      </div>
                    ) : (
                      <button type="button" onClick={() => friendsListRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} className="my-auto flex min-h-full w-full flex-col items-center justify-center gap-2 rounded-lg text-center transition-all duration-300 ease-out hover:scale-[1.02] active:scale-95">
                        <div className="grid size-14 place-items-center rounded-full border border-dashed border-amber-300/35 bg-amber-300/5 animate-pulse">
                          <UserPlus className="size-6 text-amber-200/70" />
                        </div>
                        <span className="text-xs font-semibold text-amber-100/70">بانگهێشتکردنی هاوڕێ</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-auto flex flex-col gap-3 border-t border-amber-100/10 pt-3">
              <p className="min-h-4 text-center text-xs text-emerald-100/65" aria-live="polite">{notice || `${members.length} / ${playerLimit} یاریزان`}</p>
              {session.isHost ? (
                <button type="button" disabled={!canStartGame} onClick={() => onStart(members)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-amber-200/40 bg-gradient-to-b from-amber-300 to-amber-500 px-4 font-extrabold text-[#1a2110] shadow-[0_8px_24px_rgba(217,164,65,.18)] transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-none disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none">
                  <Play className="size-4 fill-current" /> دەستپێکردنی یاری
                </button>
              ) : (
                <p className="text-center text-xs text-white/45">چاوەڕێی دەستپێکردنی خانەخوێ بە</p>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col border-t border-amber-100/15 bg-black/10 p-4 sm:p-6 lg:border-r lg:border-t-0">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-amber-100">لیستی هاوڕێکان</h3>
                <p className="mt-1 text-xs text-white/45">{availableFriends.length} هاوڕێ</p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-full border border-emerald-200/15 bg-emerald-300/10 text-emerald-200"><Users className="size-4" /></span>
            </div>
            <div ref={friendsListRef} className="flex-1 overflow-y-auto max-h-[45vh] pr-1 space-y-2.5 custom-scrollbar overscroll-contain">
              {orderedFriends.length ? orderedFriends.map((friend) => {
                const status = inviteStatus[friend.id];
                const capacityReached = members.length + pendingInviteCount >= playerLimit;
                const friendInGame = friend.status === "in_game";
                return (
                  <div key={friend.id} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.035] p-2.5 shadow-lg transition-all duration-300 ease-out hover:scale-[1.02] hover:border-amber-200/20 hover:bg-white/[.06] active:scale-95">
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5">
                      <img src={avatarImageSource(friend.avatar)} alt={friend.name} className="size-full object-cover" />
                      <span className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-[#10271d] ${friend.online === false ? "bg-white/25" : "bg-emerald-400"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{friend.name}</p>
                      <p className={`mt-0.5 text-[11px] ${friendInGame || friend.online === false ? "text-white/35" : "text-emerald-300/75"}`}>{friendInGame ? "لە ناو یارییە" : friend.online === false ? "ئۆفلاین" : "ئۆنلاین"}</p>
                    </div>
                    <button type="button" onClick={() => inviteFriend(friend)} disabled={friendInGame || Boolean(status) || capacityReached} className={`min-w-[92px] rounded-lg px-2.5 py-2 text-[11px] font-bold shadow-lg transition-all duration-300 ease-out hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed ${friendInGame ? "border border-white/5 bg-white/[.03] text-white/25 opacity-50 cursor-not-allowed pointer-events-none" : status === "joined" ? "border border-emerald-300/20 bg-emerald-400/10 text-emerald-200" : status === "declined" ? "border border-red-300/15 bg-red-400/5 text-red-200/60" : status === "sent" ? "border border-white/5 bg-white/5 text-white/45" : "border border-amber-200/25 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20 disabled:border-white/5 disabled:bg-white/[.03] disabled:text-white/25"}`}>
                      {friendInGame ? "لە ناو یارییە" : status === "joined" ? "بەشداربوو" : status === "declined" ? "نایێت" : status === "sent" ? "نێردرا" : <span className="inline-flex items-center gap-1"><UserPlus className="size-3" /> بانگهێشتکردن</span>}
                    </button>
                  </div>
                );
              }) : (
                <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-white/10 px-4 text-center text-sm text-white/45">هاوڕێیەک بۆ بانگهێشتکردن نییە</div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function OverlayShell({ title, onClose, onScroll, children }: { title: string; onClose: () => void; onScroll?: (event: React.UIEvent<HTMLDivElement>) => void; children: React.ReactNode }) {
  useHideChrome();
  return (
    <div className="glass-strong animate-soft-in fixed inset-0 z-50 mx-auto flex max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <div className="relative flex items-center justify-center w-full min-h-[44px]">
        <h2 className="text-lg font-bold text-center">{title}</h2>
        <button onClick={onClose} className="absolute right-0 glass press flex size-11 items-center justify-center rounded-full">
          <ArrowRight className="size-5" />
        </button>
      </div>
      <div className="mt-5 flex-1 overflow-y-auto no-scrollbar" onScroll={onScroll}>{children}</div>
    </div>
  );
}

function MediaDisplay({ url, alt }: { url: string; alt: string }) {
  const isVideo = url?.endsWith(".mp4") || url?.endsWith(".webm");
  if (isVideo) {
    return (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover rounded-xl"
      />
    );
  }
  return <img src={url} alt={alt} className="w-full h-full object-cover rounded-xl" />;
}

function TokenPicker({ onClose }: { onClose: () => void }) {

  return (
    <OverlayShell title="پوولەکان" onClose={onClose}>
      <div className="mb-6 flex min-h-[4.5rem] items-center gap-2 overflow-x-auto no-scrollbar rounded-2xl border-2 border-dashed border-primary/30 bg-black/5 p-2">
        <span className="m-auto block w-full text-center text-xs font-medium text-muted-foreground">
          هیچ پوولێک هەڵنەبژێراوە
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 pb-6">
      </div>
    </OverlayShell>
  );
}

function BoardPicker({ onClose }: { onClose: () => void }) {

  return (
    <OverlayShell title="تەختەکان" onClose={onClose}>
      <div className="mb-6 flex min-h-[4.5rem] items-center gap-2 overflow-x-auto no-scrollbar rounded-2xl border-2 border-dashed border-primary/30 bg-black/5 p-2">
        <span className="m-auto block w-full text-center text-xs font-medium text-muted-foreground">
          هیچ تەختەیەک هەڵنەبژێراوە
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 pb-6">
      </div>
    </OverlayShell>
  );
}

function SoundList({ items, selectedUrl, onSelect, onReplaceSlot, onClose }: { items: any[]; selectedUrl: string | null; onSelect: (url: string | null) => void; onReplaceSlot: () => boolean; onClose: () => void }) {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [replacementConfirmation, setReplacementConfirmation] = useState(false);
  const [previewedUrl, setPreviewedUrl] = useState<string | null>(null);
  
  const selectedSound = selectedUrl
    ? items.find((s) => s.audio_url === selectedUrl) ?? {
        id: "active-reaction-sound",
        name: "دەنگی هەڵبژێردراو",
        audio_url: selectedUrl,
      }
    : null;

  const handlePlay = (s: any) => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }

    let audio = audioCache[s.id];
    if (!audio) {
      audio = new Audio(s.audio_url);
      audio.preload = "auto";
      audioCache[s.id] = audio;
    }

    currentAudioRef.current = audio;
    setPreviewedUrl(s.audio_url);
    audio.currentTime = 0; 
    audio.play().catch(() => {});
    setPlayingId(s.id);

    audio.onended = () => {
      setPlayingId(null);
      if (currentAudioRef.current === audio) {
        currentAudioRef.current = null;
      }
    };
  };

  const handleSlotClick = () => {
    if (selectedUrl) {
      setReplacementConfirmation(true);
      return;
    }
    if (previewedUrl) onSelect(previewedUrl);
  };

  const confirmReplacement = () => {
    if (!onReplaceSlot()) {
      toast.error("زێڕی پێویستت نییە!", { duration: 1200 });
      return;
    }
    onSelect(null);
    setPreviewedUrl(null);
    setReplacementConfirmation(false);
  };

  return (
    <OverlayShell title="ساوندەکان" onClose={onClose}>
      <div className="mb-6 flex min-h-[8rem] items-center justify-center gap-2 overflow-x-auto no-scrollbar rounded-2xl border-2 border-dashed border-primary/30 bg-black/5 p-2">
        {selectedSound ? (
          <div 
            onClick={handleSlotClick}
            className="relative flex size-28 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-green-500 bg-black/10 px-2 shadow-[0_0_8px_rgba(34,197,94,0.4)] transition-transform active:scale-95"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
               <Volume2 className="size-5 fill-current" />
            </div>
            <span className="w-full truncate text-center text-xs font-bold">{selectedSound.name}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSlotClick}
            className="flex size-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-primary/30 bg-black/5 text-xs font-medium text-muted-foreground transition-transform active:scale-95"
          >
            <Volume2 className="size-7" />
            {previewedUrl ? "هەڵبژاردنی دەنگ" : "هیچ ساوندێک هەڵنەبژێراوە"}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
          <Volume2 className="size-16 text-muted-foreground/50" />
          <p className="text-xl font-bold text-muted-foreground">چاوەڕێی ساوند بە...</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 pb-6">
          {items.map((s) => {
            const isSelected = selectedUrl === s.audio_url;
            const isPlaying = playingId === s.id;

            return (
              <div key={s.id} className="flex flex-col items-center gap-2">
                <div
                  onClick={() => handlePlay(s)}
                  className={`press flex w-full flex-col items-center justify-between gap-2 rounded-2xl border-2 p-3 cursor-pointer transition-all ${
                    isSelected 
                      ? "border-green-500 bg-green-500/10 shadow-[0_0_10px_rgba(34,197,94,0.3)]" 
                      : "border-transparent bg-input"
                  }`}
                >
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <Play className={`size-6 fill-current ${isPlaying ? "animate-pulse" : ""}`} />
                  </div>
                  <span className="text-xs font-bold text-center truncate w-full">{s.name}</span>
                </div>

              </div>
            );
          })}
        </div>
      )}
      {replacementConfirmation && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-5 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-primary/30 bg-[#173d2f] p-4 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <p className="text-sm font-bold leading-7 text-white">
              ئەگەر دەنگی نوێ لەو خانەیە زیاد بکەی ئەبێت بڕی 15 زێڕ سەرف بکەی
            </p>
            <div className="mt-5 flex flex-row-reverse gap-3">
              <button
                type="button"
                onClick={confirmReplacement}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-transform active:scale-95"
              >
                بەڵێ
              </button>
              <button
                type="button"
                onClick={() => setReplacementConfirmation(false)}
                className="flex-1 rounded-xl bg-white/15 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
              >
                نەخێر
              </button>
            </div>
          </div>
        </div>
      )}
    </OverlayShell>
  );
}

const STICKER_SLOT_PRICES = [0, 75, 99, 120, 150];

function StickerList({ items, selectedSlots, unlockedSlots, onUnlockSlot, onAssign, onRemove, onGiphyItems, purchasedIds, onBuyRequest, onClose }: { items: any[]; selectedSlots: Array<string | null>; unlockedSlots: number[]; onUnlockSlot: (slotIndex: number) => boolean; onAssign: (slotIndex: number, imageUrl: string) => void; onRemove: (slotIndex: number) => void; onGiphyItems: (items: StickerItem[]) => void; purchasedIds: string[]; onBuyRequest: (item: any) => void; onClose: () => void }) {
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [unlockingSlots, setUnlockingSlots] = useState<Set<number>>(new Set());
  const [unlockSlot, setUnlockSlot] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [giphyItems, setGiphyItems] = useState<StickerItem[]>([]);
  const [giphyLoading, setGiphyLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMoreGiphy, setHasMoreGiphy] = useState(true);
  const [bannedSearch, setBannedSearch] = useState(false);
  const requestInFlight = useRef(false);

  const containsBannedTerm = (query: string) => {
    const normalizedQuery = query.toLocaleLowerCase();
    return BANNED_TERMS.some((term) => normalizedQuery.includes(term.toLocaleLowerCase()));
  };

  const handleStickerScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 500;
    if (nearBottom && !requestInFlight.current && hasMoreGiphy && !bannedSearch) {
      setOffset((currentOffset) => currentOffset + 50);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (containsBannedTerm(searchQuery)) return undefined;

    const timer = window.setTimeout(async () => {
      requestInFlight.current = true;
      setGiphyLoading(true);
      setErrorMessage(null);
      try {
        const results = await fetchStickers(searchQuery, offset);
        if (!cancelled) {
          setErrorMessage(null);
          setHasMoreGiphy(results.length === 50);
          setGiphyItems((previousItems) => {
            const nextItems = offset === 0
              ? results
              : [...previousItems, ...results.filter((result) => !previousItems.some((item) => item.id === result.id))];
            onGiphyItems(nextItems);
            return nextItems;
          });
        }
      } catch (error) {
        console.error("GIPHY Error Details:", error);
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setErrorMessage(message);
          setGiphyItems([]);
          onGiphyItems([]);
        }
      } finally {
        requestInFlight.current = false;
        if (!cancelled) setGiphyLoading(false);
      }
    }, searchQuery.trim() ? 300 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onGiphyItems, offset, searchQuery]);

  const handleGifClick = (gifUrl: string) => {
    const targetSlot = activeSlot !== null && unlockedSlots.includes(activeSlot)
      ? activeSlot
      : unlockedSlots.find((slotIndex) => !selectedSlots[slotIndex]);
    if (targetSlot === undefined) {
      toast.error("Unlock a sticker slot first", { duration: 1200 });
      return;
    }
    if (selectedSlots.includes(gifUrl)) return;
    onAssign(targetSlot, gifUrl);
    setActiveSlot(null);
  };

  const handleSlotClick = (slotIndex: number) => {
    if (unlockedSlots.includes(slotIndex)) {
      if (slotIndex === 0 && selectedSlots[slotIndex]) {
        onRemove(slotIndex);
        setActiveSlot(null);
        return;
      }
      setActiveSlot(slotIndex);
      return;
    }
    if (slotIndex === 0 || unlockingSlots.has(slotIndex)) return;
    setUnlockSlot(slotIndex);
  };

  const confirmUnlock = () => {
    if (unlockSlot === null) return;
    if (!onUnlockSlot(unlockSlot)) {
      toast.error("زێڕی پێویستت نییە", { duration: 1200 });
      return;
    }
    const targetSlot = unlockSlot;
    setUnlockSlot(null);
    setActiveSlot(targetSlot);
    setUnlockingSlots((prev) => new Set(prev).add(targetSlot));
    window.setTimeout(() => {
      setUnlockingSlots((prev) => {
        const next = new Set(prev);
        next.delete(targetSlot);
        return next;
      });
    }, 1000);
  };

  const sortedStickers = [...items].sort((a, b) => {
    const aOwned = purchasedIds.includes(a.id) || !a.price;
    const bOwned = purchasedIds.includes(b.id) || !b.price;
    if (aOwned && !bOwned) return -1;
    if (!aOwned && bOwned) return 1;
    return 0;
  });

  return (
    <OverlayShell title="ستیکەرەکان" onClose={onClose} onScroll={handleStickerScroll}>
      <label className="mb-4 flex items-center gap-2 rounded-xl border border-primary/25 bg-black/10 px-3 py-2.5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(event) => {
            const nextQuery = event.target.value;
            const isBanned = containsBannedTerm(nextQuery);
            setSearchQuery(nextQuery);
            setBannedSearch(isBanned);
            setOffset(0);
            setHasMoreGiphy(!isBanned);
            if (isBanned) {
              setErrorMessage("This search term is not allowed.");
              setGiphyItems([]);
              onGiphyItems([]);
            } else {
              setErrorMessage(null);
            }
          }}
          placeholder="گەڕان بەدوای ستیکەر..."
          className={`min-w-0 flex-1 rounded-lg border-2 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground ${bannedSearch ? "border-[#ff4d4d] shadow-[0_0_12px_rgba(255,77,77,0.8)]" : "border-transparent"}`}
          type="search"
          aria-label="Search GIPHY stickers"
        />
        {giphyLoading && <Loader2 className="size-4 shrink-0 animate-spin text-primary" />}
      </label>

      <div className="mb-6 grid grid-cols-5 gap-2">
        {STICKER_SLOT_PRICES.map((price, slotIndex) => {
          const isUnlocking = unlockingSlots.has(slotIndex);
          const unlocked = unlockedSlots.includes(slotIndex) && !isUnlocking;
          const sticker = selectedSlots[slotIndex]
            ? [...items, ...giphyItems].find((item) => item.image_url === selectedSlots[slotIndex])
            : null;
          return (
            <button
              key={price}
              type="button"
              onClick={() => handleSlotClick(slotIndex)}
              className={`sticker-slot relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-xl border-2 transition-all duration-500 ${
                activeSlot === slotIndex ? "scale-105 border-primary shadow-[0_0_14px_rgba(34,197,94,0.55)]" : "border-primary/30"
              } ${unlocked ? "bg-primary/10" : "bg-black/10"} ${isUnlocking ? "sticker-slot-unlocking" : ""}`}
              aria-label={unlocked ? "Add Sticker" : `Unlock sticker slot for ${price} Gold`}
            >
              {sticker ? (
                <span className="relative block size-full animate-[sticker-slot-shrink_500ms_cubic-bezier(.22,1,.36,1)]">
                  <MediaDisplay url={sticker.image_url} alt={sticker.name} />
                  {unlocked && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Clear sticker"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove(slotIndex);
                        setActiveSlot(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          onRemove(slotIndex);
                          setActiveSlot(null);
                        }
                      }}
                      className="absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded-full bg-black/65 text-white"
                    >
                      <X className="size-3.5" />
                    </span>
                  )}
                </span>
              ) : unlocked ? (
                <Plus className="size-7 text-primary" />
              ) : (
                <span className="relative z-[3] flex flex-col items-center gap-0.5 text-[9px] font-extrabold text-gold">
                  <GoldBar className="h-5 w-8" />
                  {price}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {errorMessage && (
        <p className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert">
          {errorMessage}
        </p>
      )}

      {items.length === 0 && giphyItems.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
          <Sticker className="size-16 text-muted-foreground/50" />
          <p className="text-xl font-bold text-muted-foreground">چاوەڕێی ستیکەر بە...</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 pb-6">
          {[...giphyItems, ...sortedStickers].map((st) => {
            const isSelected = selectedSlots.includes(st.image_url);
            const isOwned = purchasedIds.includes(st.id) || !st.price;

            return (
              <div key={st.id} className="flex flex-col items-center gap-2">
                <div
                  onClick={() => handleGifClick(st.image_url)}
                  className={`press flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all ${
                    isSelected 
                      ? "border-green-500 bg-green-500/10 shadow-[0_0_10px_rgba(34,197,94,0.3)]" 
                      : "border-transparent bg-input"
                  }`}
                >
                  <div className="flex size-20 w-full items-center justify-center overflow-hidden rounded-xl bg-black/10">
                    <MediaDisplay url={st.image_url} alt={st.name} />
                  </div>
                  <span className="w-full truncate text-center text-xs font-semibold">{st.name}</span>
                </div>

                {!isOwned && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onBuyRequest(st); }} 
                    className="flex w-[80%] max-w-[5rem] items-center justify-center gap-1.5 rounded-lg bg-yellow-400 py-1.5 text-[11px] font-extrabold text-yellow-950 shadow-sm transition-transform active:scale-95"
                  >
                    <span>{st.price}</span>
                    <Coins className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unlockSlot !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-5 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-primary/30 bg-[#173d2f] p-4 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <p className="text-sm font-bold leading-7 text-white">
              ئەگەر دەتەوێت ئەم خانەیە بە هەمیشەیی بکەیتەوە دەبێت بڕی {STICKER_SLOT_PRICES[unlockSlot]} زێڕ سەرف بکەی
            </p>
            <div className="mt-5 flex flex-row-reverse gap-3">
              <button
                type="button"
                onClick={confirmUnlock}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-transform active:scale-95"
              >
                بەڵێ
              </button>
              <button
                type="button"
                onClick={() => setUnlockSlot(null)}
                className="flex-1 rounded-xl bg-white/15 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
              >
                نەخێر
              </button>
            </div>
          </div>
        </div>
      )}
    </OverlayShell>
  );
}