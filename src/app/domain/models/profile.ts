import type { IsoDateTime, JsonObject, Uuid } from './common';

/** `public.profiles` — 1:1 com `auth.users`. */
export interface Profile {
  id: Uuid;
  displayName: string;
  avatarPath: string | null;
  locale: string;
  uiPrefs: JsonObject;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
