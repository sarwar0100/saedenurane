import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Friend } from "@/lib/app-store";

type RelationshipProfile = {
  id?: string | null;
  username?: string | null;
  display_name?: string | null;
  bio?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  birth_year?: string | null;
  online?: boolean | null;
  points?: number | null;
  gold?: number | null;
  games_played?: number | null;
  wins?: number | null;
  losses?: number | null;
};

type RelationshipRow = {
  sender_id: string;
  receiver_id: string;
  status: string;
  sender?: RelationshipProfile | RelationshipProfile[] | null;
  receiver?: RelationshipProfile | RelationshipProfile[] | null;
};

const toFriend = (profile: RelationshipProfile | null | undefined, id: string): Friend | null => {
  if (!profile) return null;
  const gamesPlayed = Number(profile.games_played ?? 0);
  const wins = Number(profile.wins ?? 0);
  return {
    id: String(profile.id ?? id),
    name: String(profile.display_name ?? profile.username ?? "یاریزان"),
    ...(profile.bio ? { bio: profile.bio } : {}),
    avatar: String(profile.avatar_url ?? ""),
    ...(profile.city ? { city: profile.city } : {}),
    ...(profile.birth_year ? { birth_year: profile.birth_year } : {}),
    online: profile.online !== false,
    points: Number(profile.points ?? 0),
    gold: Number(profile.gold ?? 0),
    games_played: gamesPlayed,
    wins,
    losses: Number(profile.losses ?? Math.max(0, gamesPlayed - wins)),
  };
};

const uniqueFriends = (friends: (Friend | null)[]) =>
  Array.from(
    new Map(
      friends
        .filter((friend): friend is Friend => friend !== null)
        .map((friend) => [friend.id, friend]),
    ).values(),
  );

export function useProfileRelationships(
  profileId: string | undefined,
  fallbackFriends: Friend[],
  blockedIds: string[],
) {
  const [relationships, setRelationships] = useState({
    followers: fallbackFriends,
    following: fallbackFriends,
  });

  useEffect(() => {
    const client = supabase;
    const fallback = fallbackFriends.filter((friend) => !blockedIds.includes(friend.id));
    if (!client || !profileId) {
      setRelationships({ followers: fallback, following: fallback });
      return;
    }

    let cancelled = false;
    let refreshSequence = 0;
    const loadRelationships = async () => {
      const sequence = ++refreshSequence;
      const { data, error } = await client
        .from("friend_requests")
        .select(
          "sender_id, receiver_id, status, sender:profiles!friend_requests_sender_id_fkey(id, username, display_name, bio, avatar_url, city, birth_year, age, online, points, gold, games_played, wins, losses), receiver:profiles!friend_requests_receiver_id_fkey(id, username, display_name, bio, avatar_url, city, birth_year, age, online, points, gold, games_played, wins, losses)",
        )
        .or(`sender_id.eq.${profileId},receiver_id.eq.${profileId}`)
        .in("status", ["pending", "accepted"]);

      if (cancelled || sequence !== refreshSequence) return;
      if (error) {
        console.error("Supabase profile relationships error:", error);
        setRelationships({ followers: fallback, following: fallback });
        return;
      }

      const followers: (Friend | null)[] = [];
      const following: (Friend | null)[] = [];
      for (const row of (data ?? []) as RelationshipRow[]) {
        const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
        const receiver = Array.isArray(row.receiver) ? row.receiver[0] : row.receiver;
        if (row.receiver_id === profileId && ["pending", "accepted"].includes(row.status)) {
          if (!blockedIds.includes(row.sender_id)) {
            followers.push(toFriend(sender, row.sender_id));
          }
        }
        if (row.sender_id === profileId && row.status === "accepted") {
          if (!blockedIds.includes(row.receiver_id)) {
            following.push(toFriend(receiver, row.receiver_id));
          }
        }
      }

      if (!cancelled && sequence === refreshSequence) {
        setRelationships({
          followers: uniqueFriends(followers),
          following: uniqueFriends(following),
        });
      }
    };

    const channel = client
      .channel(`profile-relationships:${profileId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        void loadRelationships();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => {
        void loadRelationships();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadRelationships();
      });

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [blockedIds, fallbackFriends, profileId]);

  return relationships;
}
