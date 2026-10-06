import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SnakesGame } from "@/components/SnakesGame";
import { useApp } from "@/lib/app-store";
import { supabase } from "@/lib/supabase";
import { useHideChrome } from "@/components/chrome";
import type { BoardSkin } from "@/lib/game-data";

type MatchPlayer = {
  id: string;
  name: string;
  avatar: string;
  token_url?: string;
  score: number;
  position: number;
  connected: boolean;
};
type MatchConfig = {
  gameId: string;
  lobbyId: string;
  board: BoardSkin & { image_url?: string };
  players: MatchPlayer[];
  turnIndex: number;
  turnNumber: number;
  turnStartedAt: string;
};

export const Route = createFileRoute("/game/$matchId")({
  component: SharedMatchRoute,
});

function SharedMatchRoute() {
  useHideChrome();
  const { matchId } = Route.useParams();
  const { user } = useApp();
  const navigate = useNavigate();
  const [match, setMatch] = useState<MatchConfig | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setMatch(null);
    setLoadFailed(false);
    const client = supabase;
    if (!client) {
      setLoadFailed(true);
      return;
    }
    if (!user?.id) return;
    let active = true;
    let loadVersion = 0;
    const loadMatch = async () => {
      const version = ++loadVersion;
      const { data: session, error: sessionError } = await client
        .from("game_sessions")
        .select(
          "game_id, lobby_id, status, launch_reason, board, players, turn_index, turn_number, turn_started_at",
        )
        .eq("game_id", matchId)
        .maybeSingle();
      if (
        sessionError ||
        !session ||
        session.game_id !== matchId ||
        session.status !== "in_progress" ||
        !Array.isArray(session.players) ||
        session.players.length < 2
      ) {
        if (active && version === loadVersion) setLoadFailed(true);
        return;
      }

      const { data: memberships, error: membersError } = await client
        .from("lobby_players")
        .select("user_id, token_url, joined_at")
        .eq("lobby_id", session.lobby_id)
        .order("joined_at", { ascending: true });
      if (!active || version !== loadVersion) return;
      if (membersError || !memberships || memberships.length < 2) {
        setLoadFailed(true);
        return;
      }

      const { data: profiles, error: profilesError } = await client
        .from("profiles")
        .select("id, username, display_name, avatar_url, points")
        .in(
          "id",
          memberships.map((member) => member.user_id),
        );
      if (!active || version !== loadVersion) return;
      if (profilesError) {
        setLoadFailed(true);
        return;
      }

      const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const sessionPlayers = new Map(
        (session.players as MatchPlayer[]).map((player) => [player.id, player]),
      );
      const players = memberships.flatMap((member) => {
        const profile = profilesById.get(member.user_id);
        const sessionPlayer = sessionPlayers.get(member.user_id);
        if (!profile || !sessionPlayer) return [];
        return [
          {
            id: member.user_id,
            name: profile.display_name ?? profile.username ?? "یاریزان",
            avatar: profile.avatar_url ?? "",
            score: profile.points ?? 0,
            position: sessionPlayer.position ?? 0,
            connected: sessionPlayer.connected === true,
            ...(member.token_url ? { token_url: member.token_url } : {}),
          },
        ];
      });
      if (players.length < 2) {
        setLoadFailed(true);
        return;
      }
      setMatch({
        gameId: session.game_id,
        lobbyId: session.lobby_id,
        board: session.board as MatchConfig["board"],
        players,
        turnIndex: session.turn_index,
        turnNumber: session.turn_number,
        turnStartedAt: session.turn_started_at,
      });
    };

    const channel = client
      .channel(`game-session:${matchId}:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_sessions", filter: `game_id=eq.${matchId}` },
        () => void loadMatch(),
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") void loadMatch();
        else if (error) console.warn("Game session Realtime connection error:", error.message);
      });
    void loadMatch();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [matchId, user?.id]);

  if (match) {
    const localPlayer = match.players.find((player) => player.id === user?.id);
    return (
      <SnakesGame
        board={match.board}
        me={{
          name: user?.name ?? localPlayer?.name ?? "یاریزان",
          avatar: user?.avatar ?? localPlayer?.avatar ?? "",
          ...(localPlayer?.token_url ? { token_url: localPlayer.token_url } : {}),
        }}
        initialPlayers={match.players}
        initialTurn={match.turnIndex}
        initialTurnNumber={match.turnNumber}
        initialTurnStartedAt={match.turnStartedAt}
        matchId={matchId}
        onClose={() => {
          window.dispatchEvent(new Event("show-gold-counter"));
          void navigate({ to: "/app/play" });
        }}
      />
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-emerald-950 px-5 text-center text-white">
      <div className="flex flex-col items-center gap-3">
        {loadFailed ? (
          <>
            <p className="text-sm font-bold">نەتوانرا یارییەکە بکرێتەوە</p>
            <button
              type="button"
              onClick={() => void navigate({ to: "/app/play" })}
              className="rounded-lg border border-amber-300/40 px-4 py-2 text-sm font-bold text-amber-100"
            >
              گەڕانەوە بۆ یاری
            </button>
          </>
        ) : (
          <>
            <Loader2 className="size-7 animate-spin text-amber-300" />
            <p className="text-sm text-emerald-100/70">یارییەکە دەکرێتەوە...</p>
          </>
        )}
      </div>
    </main>
  );
}
