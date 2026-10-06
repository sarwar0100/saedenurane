import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { avatarImageSource, useApp, type Player } from "@/lib/app-store";
import { PlayerProfileSheet } from "@/components/PlayerProfileSheet";
import { supabase } from "@/lib/supabase";

type LeaderboardProfile = {
  id: string;
  username: string | null;
  display_name?: string | null;
  bio?: string | null;
  city?: string | null;
  birth_year?: string | null;
  avatar_url: string | null;
  points: number | null;
  gold: number | null;
  wins: number | null;
  losses: number | null;
  games_played: number | null;
  online: boolean | null;
  hide_profile_details?: boolean | null;
  hide_following?: boolean | null;
  hide_city_age?: boolean | null;
  hide_online_status?: boolean | null;
  age?: number | null;
};

export const Route = createFileRoute("/app/leaderboards")({
  head: () => ({
    meta: [
      { title: "ڕیزبەندی — مار و پەیژە" },
      { name: "description", content: "ڕیزبەندی یاریزانان بەپێی خاڵ و زێڕ و هاوڕێکان." },
      { property: "og:title", content: "ڕیزبەندی — مار و پەیژە" },
      { property: "og:description", content: "ڕیزبەندی گشتی یاریزانان." },
    ],
  }),
  component: LeaderboardsTab,
});

type Tab = "points" | "friends" | "gold";

const tabs: { id: Tab; label: string }[] = [
  { id: "points", label: "بەرزترین خاڵ" },
  { id: "friends", label: "ڕیزبەندی هاوڕێکان" },
  { id: "gold", label: "زۆرترین زێڕ" },
];

const ROW = 68;
const leaderboardCache = new Map<string, Player[]>();

function playerFromProfile(profile: LeaderboardProfile): Player {
  return {
    id: String(profile.id),
    name: String(profile.display_name ?? profile.username ?? "یاریزان"),
    handle: String(profile.username ?? ""),
    ...(profile.bio ? { bio: profile.bio } : {}),
    ...(profile.city ? { city: profile.city } : {}),
    ...(profile.birth_year ? { birth_year: profile.birth_year } : {}),
    avatar: String(profile.avatar_url ?? ""),
    online: profile.online !== false,
    hideProfileDetails: profile.hide_profile_details === true,
    hideFollowing: profile.hide_following === true,
    hideCityAge: profile.hide_city_age === true || profile.hide_profile_details === true,
    hideOnlineStatus: profile.hide_online_status === true || profile.online === false,
    ...(profile.age ? { age: Number(profile.age) } : {}),
    points: Number(profile.points ?? 0),
    gold: Number(profile.gold ?? 0),
    games_played: Number(profile.games_played ?? 0),
    wins: Number(profile.wins ?? 0),
    losses: Number(profile.losses ?? 0),
  };
}

function mergeProfileUpdate(player: Player, update: Partial<LeaderboardProfile>): Player {
  const username = update.username;
  const displayName = update.display_name;
  return {
    ...player,
    ...(username !== undefined ? { handle: username ?? "" } : {}),
    ...(displayName !== undefined || username !== undefined
      ? { name: String(displayName ?? username ?? player.name) }
      : {}),
    ...(update.bio !== undefined ? { bio: update.bio ?? "" } : {}),
    ...(update.city !== undefined ? { city: update.city ?? "" } : {}),
    ...(update.birth_year !== undefined ? { birth_year: update.birth_year ?? "" } : {}),
    ...(update.avatar_url !== undefined ? { avatar: update.avatar_url ?? "" } : {}),
    ...(update.online !== undefined ? { online: update.online !== false } : {}),
    ...(update.hide_profile_details !== undefined
      ? { hideProfileDetails: update.hide_profile_details === true }
      : {}),
    ...(update.hide_following !== undefined ? { hideFollowing: update.hide_following === true } : {}),
    ...(update.hide_city_age !== undefined
      ? { hideCityAge: update.hide_city_age === true || update.hide_profile_details === true }
      : {}),
    ...(update.hide_online_status !== undefined
      ? { hideOnlineStatus: update.hide_online_status === true }
      : {}),
    ...(update.points !== undefined ? { points: Number(update.points ?? 0) } : {}),
    ...(update.gold !== undefined ? { gold: Number(update.gold ?? 0) } : {}),
    ...(update.games_played !== undefined ? { games_played: Number(update.games_played ?? 0) } : {}),
    ...(update.wins !== undefined ? { wins: Number(update.wins ?? 0) } : {}),
    ...(update.losses !== undefined ? { losses: Number(update.losses ?? 0) } : {}),
  };
}

function LeaderboardsTab() {
  const { visibleFriends, isProMember, equippedProFrame, user, gold } = useApp();
  const [tab, setTab] = useState<Tab>("points");
  const [selected, setSelected] = useState<Player | null>(null);
  const [profilePlayers, setProfilePlayers] = useState<Player[]>(() =>
    user?.id ? (leaderboardCache.get(user.id) ?? []) : [],
  );
  const [loading, setLoading] = useState(() => profilePlayers.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const localFallback = useMemo(() => {
    const localFallback = visibleFriends.map((friend): Player => ({
      id: friend.id,
      name: friend.name,
      handle: friend.handle ?? "",
      avatar: friend.avatar,
      online: friend.online !== false,
      points: friend.points,
      gold: friend.gold,
      games_played: friend.games_played,
      wins: friend.wins,
      losses: friend.losses ?? 0,
    }));
    if (user?.id && !localFallback.some((player) => player.id === user.id)) {
      localFallback.push({
        id: user.id,
        name: user.name,
        handle: user.handle ?? "",
        ...(user.bio ? { bio: user.bio } : {}),
        ...(user.city ? { city: user.city } : {}),
        ...(user.birth_year ? { birth_year: user.birth_year } : {}),
        avatar: user.avatar,
        online: user.online !== false,
        points: user.points,
        gold,
        games_played: user.games_played,
        wins: user.wins,
        losses: Math.max(0, user.games_played - user.wins),
      });
    }
    return localFallback;
  }, [gold, user, visibleFriends]);
  const latestProfilePlayers = useRef(profilePlayers);
  const latestLocalFallback = useRef(localFallback);

  useEffect(() => {
    latestProfilePlayers.current = profilePlayers;
    latestLocalFallback.current = localFallback;
  }, [localFallback, profilePlayers]);

  useEffect(() => {
    const client = supabase;
    const cached = user?.id ? leaderboardCache.get(user.id) : undefined;
    if (cached) {
      setProfilePlayers(cached);
      setLoading(false);
    }
    if (!client || !user?.id) {
      setProfilePlayers(latestLocalFallback.current);
      setLoading(false);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    const loadProfiles = async () => {
      setLoadError(null);
      try {
        const primary = await client
          .from("profiles")
          .select(
            "id, username, display_name, bio, avatar_url, points, gold, wins, losses, games_played, online, age, hide_profile_details, hide_following, hide_city_age, hide_online_status",
          )
          .order("gold", { ascending: false })
          .order("points", { ascending: false })
          .order("username", { ascending: true });
        let data = primary.data as LeaderboardProfile[] | null;
        let error = primary.error;
        if (primary.error) {
          console.warn(
            "Leaderboard query with optional display_name failed; retrying:",
            primary.error,
          );
          const fallback = await client
            .from("profiles")
            .select(
              "id, username, avatar_url, city, birth_year, points, gold, wins, losses, games_played, online, hide_profile_details, hide_following, hide_city_age, hide_online_status",
            )
            .order("gold", { ascending: false })
            .order("points", { ascending: false })
            .order("username", { ascending: true });
          data = fallback.data as LeaderboardProfile[] | null;
          error = fallback.error;
        }
        if (error) throw error;

        const players = (data ?? []).map(playerFromProfile);
        if (!cancelled) {
          leaderboardCache.set(user.id, players);
          setProfilePlayers(players);
          setLoading(false);
        }
      } catch (error) {
        console.error("Supabase Profiles Error:", error);
        if (!cancelled) {
          const fallback = latestLocalFallback.current;
          setProfilePlayers((current) => {
            if (current.length) return current;
            leaderboardCache.set(user.id, fallback);
            return fallback;
          });
          setLoadError(null);
          setLoading(false);
        }
      }
    };
    void loadProfiles();
    let channel: ReturnType<typeof client.channel> | null = null;
    try {
      channel = client
        .channel("leaderboard-profiles")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles" },
          (payload) => {
            const updated = payload.new as Partial<LeaderboardProfile> & { id?: string };
            if (!updated.id) return;
            const cachedPlayers = leaderboardCache.get(user.id) ?? latestProfilePlayers.current;
            const updatePlayers = (players: Player[]) =>
              players.map((player) =>
                player.id === updated.id ? mergeProfileUpdate(player, updated) : player,
              );
            const nextCachedPlayers = updatePlayers(cachedPlayers);
            leaderboardCache.set(user.id, nextCachedPlayers);
            setProfilePlayers(updatePlayers);
            setSelected((current) =>
              current && current.id === updated.id
                ? mergeProfileUpdate(current, updated)
                : current,
            );
          },
        )
        .subscribe();
    } catch (error) {
      console.warn("Leaderboard realtime updates unavailable:", error);
    }
    return () => {
      cancelled = true;
      if (channel) {
        void client.removeChannel(channel).catch((error: unknown) => {
          console.warn("Leaderboard realtime cleanup failed:", error);
        });
      }
    };
  }, [user?.id]);

  const rows = useMemo(() => {
    const source =
      tab === "friends"
        ? profilePlayers.filter(
            (player) =>
              player.id === user?.id || visibleFriends.some((friend) => friend.id === player.id),
          )
        : profilePlayers;
    return [...source].sort((first, second) => {
      if (tab === "gold") return second.gold - first.gold || second.points - first.points;
      return second.points - first.points || second.gold - first.gold;
    });
  }, [profilePlayers, tab, user?.id, visibleFriends]);

  return (
    <section className="min-h-screen px-4 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] pb-32">
      <div className="glass mb-5 flex gap-1 rounded-2xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all duration-300 ${
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center text-primary">
          <Loader2 className="size-7 animate-spin" aria-label="بارکردن" />
        </div>
      ) : loadError ? (
        <p className="pt-10 text-center text-sm text-destructive">{loadError}</p>
      ) : rows.length === 0 ? (
        <p className="pt-10 text-center text-sm text-muted-foreground">هیچ یاریزانێک دیار نییە</p>
      ) : (
        <div className="relative" style={{ height: rows.length * ROW }}>
          {rows.map((p, i) => (
            <div
              key={p.id}
              style={{ transform: `translateY(${i * ROW}px)` }}
              className={`glass absolute inset-x-0 top-0 flex h-[60px] items-center gap-3 rounded-2xl p-3 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                p.id === "me" ? "border-primary/60 shadow-[var(--shadow-glow)]" : ""
              }`}
            >
              <span className="w-6 text-center text-sm font-extrabold text-primary">{i + 1}</span>
              {p.avatar ? (
                <button
                  onClick={() => setSelected(p)}
                  className="press shrink-0"
                  aria-label={`پرۆفایلی ${p.name}`}
                >
                  <span
                    className={`block size-10 rounded-full p-0.5 ring-2 ${p.online === false || p.hideOnlineStatus ? "ring-slate-400/60" : "ring-emerald-400/80 shadow-[0_0_14px_rgba(52,211,153,0.3)]"}`}
                  >
                    <img
                      src={avatarImageSource(p.avatar)}
                      alt={p.name}
                      className={`size-full rounded-full bg-secondary ${p.id === "me" && isProMember && equippedProFrame ? "border-2 border-yellow-300 shadow-[0_0_12px_rgba(250,204,21,.8)]" : ""}`}
                    />
                  </span>
                </button>
              ) : (
                <span className="size-9 rounded-full bg-secondary" />
              )}
              <button onClick={() => setSelected(p)} className="press flex-1 text-right font-bold">
                <span
                  className={
                    p.id === "me" && isProMember
                      ? "bg-gradient-to-r from-yellow-200 to-amber-600 bg-clip-text text-transparent"
                      : ""
                  }
                >
                  {p.name}
                </span>
                {p.id === "me" && isProMember && (
                  <Crown className="mr-1 inline size-3 text-yellow-500" />
                )}
                {p.id === "me" && <span className="mr-2 text-xs text-primary">(تۆ)</span>}
              </button>
              <span className="text-sm font-bold tabular-nums text-gold transition-all duration-500">
                {p.gold}
              </span>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <PlayerProfileSheet
          player={selected}
          followersCount={visibleFriends.length}
          followingCount={visibleFriends.length}
          allowFriendRequest
          showActions
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
