import type { CalendarDefinition } from '../calendar/calendar-definition';
import type { IsoDateTime, SoftDeletable, Tick, Uuid, Versioned } from './common';

/** `public.worlds`. */
export interface World extends Versioned, SoftDeletable {
  id: Uuid;
  ownerId: Uuid;
  name: string;
  description: string | null;
  coverAssetId: Uuid | null;
  timeStart: Tick;
  timeEnd: Tick;
  /** "Agora da narrativa" opcional. */
  nowTick: Tick | null;
  archivedAt: IsoDateTime | null;
}

/** Enum `public.member_role`. */
export type MemberRole = 'owner' | 'editor';
export const MEMBER_ROLES: readonly MemberRole[] = ['owner', 'editor'];

/** `public.world_members`. */
export interface WorldMember {
  worldId: Uuid;
  userId: Uuid;
  role: MemberRole;
  createdAt: IsoDateTime;
}

/** `public.calendars` — um por mundo. */
export interface WorldCalendar {
  worldId: Uuid;
  definition: CalendarDefinition;
  updatedAt: IsoDateTime;
}
