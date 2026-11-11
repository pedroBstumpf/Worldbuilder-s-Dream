import type { IsoDateTime, Uuid } from './common';

export type ExternalLinkProvider = 'google_doc' | 'google_drive' | 'url';
export type ExternalLinkPurpose = 'primary_text' | 'chapter' | 'attachment';

/**
 * `public.external_links` — Google Docs/Drive e URLs (ADR-0008).
 * `entityId` e `eventId` nulos = vínculo do mundo.
 */
export interface ExternalLink {
  id: Uuid;
  worldId: Uuid;
  entityId: Uuid | null;
  eventId: Uuid | null;
  provider: ExternalLinkProvider;
  purpose: ExternalLinkPurpose;
  /** Id do arquivo no Drive ou do Doc. */
  externalId: string | null;
  mimeType: string | null;
  name: string;
  webViewLink: string | null;
  iconUrl: string | null;
  /** Última revisão do Doc vista pelo app. */
  revisionId: string | null;
  sortOrder: number;
  /** Cópia opcional (opt-in) do texto, para busca. */
  searchText: string | null;
  linkedBy: Uuid;
  createdAt: IsoDateTime;
}
