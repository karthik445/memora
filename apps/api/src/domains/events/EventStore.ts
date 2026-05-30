import { createHash } from 'crypto'
import type { Pool, QueryResult } from 'pg'
import type { WeddingRole } from '@memora/auth/permissions.js'

// ─────────────────────────────────────────────────────────────────────────────
// EventStore
//
// Append-only write path for selection events.
// All reads go through typed query methods that return activity feeds,
// photo histories, and aggregate statistics.
//
// Key design decisions:
// - Every write is append-only (no UPDATE/DELETE)
// - Row hash provides tamper evidence for compliance scenarios
// - Correlation ID groups batch operations so they appear as one activity
// - Causation ID links undo events back to their origin
// ─────────────────────────────────────────────────────────────────────────────

export type SelectionEventType =
  | 'PHOTO_FAVORITED'
  | 'PHOTO_UNFAVORITED'
  | 'PHOTO_MARKED_MUST_HAVE'
  | 'PHOTO_UNMARKED_MUST_HAVE'
  | 'PHOTO_REJECTED'
  | 'PHOTO_UNREJECTED'
  | 'PHOTOS_BULK_FLAGGED'
  | 'PHOTOS_BULK_UNFLAGGED'
  | 'SELECTION_APPROVED'
  | 'SELECTION_CHANGE_REQUESTED'
  | 'PHOTO_ADDED_TO_ALBUM'
  | 'PHOTO_REMOVED_FROM_ALBUM'
  | 'ALBUM_PUBLISHED'
  | 'ALBUM_UNPUBLISHED'
  | 'COMMENT_ADDED'
  | 'COMMENT_DELETED'
  | 'AI_BLUR_DETECTED'
  | 'AI_DUPLICATE_DETECTED'
  | 'AI_FACE_IDENTIFIED'

export interface AppendEventParams {
  tenantId: string
  weddingId: string
  photoId?: string
  actorId?: string
  actorRole?: WeddingRole
  eventType: SelectionEventType
  payload?: Record<string, unknown>
  correlationId?: string
  causationId?: string
  clientTime?: Date
}

export interface SelectionEvent {
  id: string
  tenantId: string
  weddingId: string
  photoId: string | null
  actorId: string | null
  actorRole: WeddingRole | null
  eventType: SelectionEventType
  payload: Record<string, unknown>
  correlationId: string | null
  causationId: string | null
  occurredAt: Date
}

export interface ActivityFeedItem extends SelectionEvent {
  actorName: string | null
  photoFilename: string | null
}

export interface PhotoHistory {
  events: SelectionEvent[]
  currentFlag: string
  changeCount: number
}

export interface SelectionStats {
  totalPhotos: number
  favoriteCount: number
  mustHaveCount: number
  rejectedCount: number
  unflaggedCount: number
  topContributors: { userId: string; name: string; eventCount: number }[]
}

export class EventStore {
  constructor(private readonly db: Pool) {}

  // ── Write path ─────────────────────────────────────────────────────────────

  async append(params: AppendEventParams): Promise<SelectionEvent> {
    const payload = params.payload ?? {}
    const rowHash = this.computeRowHash(params)

    const { rows } = await this.db.query<SelectionEvent>(
      `INSERT INTO selection_events
         (tenant_id, wedding_id, photo_id, actor_id, actor_role, event_type,
          payload, correlation_id, causation_id, client_time, row_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        params.tenantId,
        params.weddingId,
        params.photoId ?? null,
        params.actorId ?? null,
        params.actorRole ?? null,
        params.eventType,
        JSON.stringify(payload),
        params.correlationId ?? null,
        params.causationId ?? null,
        params.clientTime ?? null,
        rowHash,
      ],
    )

    return rows[0]!
  }

  /**
   * Undo the last flag event for a photo.
   * Appends a reversal event referencing the original as causation.
   */
  async undoLastFlag(
    tenantId: string,
    weddingId: string,
    photoId: string,
    actorId: string,
    actorRole: WeddingRole,
  ): Promise<SelectionEvent | null> {
    // Get the last flag event for this photo
    const { rows } = await this.db.query<SelectionEvent>(
      `SELECT * FROM selection_events
       WHERE tenant_id=$1 AND photo_id=$2
         AND event_type IN (
           'PHOTO_FAVORITED','PHOTO_UNFAVORITED',
           'PHOTO_MARKED_MUST_HAVE','PHOTO_UNMARKED_MUST_HAVE',
           'PHOTO_REJECTED','PHOTO_UNREJECTED'
         )
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [tenantId, photoId],
    )

    if (!rows[0]) return null

    const REVERSAL_MAP: Partial<Record<SelectionEventType, SelectionEventType>> = {
      PHOTO_FAVORITED:          'PHOTO_UNFAVORITED',
      PHOTO_MARKED_MUST_HAVE:   'PHOTO_UNMARKED_MUST_HAVE',
      PHOTO_REJECTED:           'PHOTO_UNREJECTED',
      PHOTO_UNFAVORITED:        'PHOTO_FAVORITED',
      PHOTO_UNMARKED_MUST_HAVE: 'PHOTO_MARKED_MUST_HAVE',
      PHOTO_UNREJECTED:         'PHOTO_REJECTED',
    }

    const reversalType = REVERSAL_MAP[rows[0].eventType]
    if (!reversalType) return null

    return this.append({
      tenantId,
      weddingId,
      photoId,
      actorId,
      actorRole,
      eventType: reversalType,
      payload: { undoneEventId: rows[0].id, undoneEventType: rows[0].eventType },
      causationId: rows[0].id,
    })
  }

  // ── Read path ──────────────────────────────────────────────────────────────

  /**
   * Activity feed for a wedding — paginated, newest first.
   * Includes actor name and photo filename for display.
   */
  async getActivityFeed(
    tenantId: string,
    weddingId: string,
    limit = 50,
    cursor?: string,
  ): Promise<{ items: ActivityFeedItem[]; nextCursor: string | null }> {
    let cursorTime: Date | null = null

    if (cursor) {
      const { rows } = await this.db.query<{ occurred_at: Date }>(
        `SELECT occurred_at FROM selection_events WHERE id=$1`,
        [cursor],
      )
      cursorTime = rows[0]?.occurred_at ?? null
    }

    const { rows } = await this.db.query<ActivityFeedItem>(
      `SELECT
         se.*,
         CONCAT(u.first_name, ' ', u.last_name) AS actor_name,
         p.original_filename AS photo_filename
       FROM selection_events se
       LEFT JOIN users u ON u.id = se.actor_id
       LEFT JOIN photos p ON p.id = se.photo_id
       WHERE se.tenant_id = $1
         AND se.wedding_id = $2
         ${cursorTime ? 'AND se.occurred_at < $4' : ''}
       ORDER BY se.occurred_at DESC
       LIMIT $3`,
      cursorTime
        ? [tenantId, weddingId, limit + 1, cursorTime]
        : [tenantId, weddingId, limit + 1],
    )

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null

    return { items, nextCursor }
  }

  /**
   * Full history for a single photo — all events chronologically.
   */
  async getPhotoHistory(
    tenantId: string,
    photoId: string,
  ): Promise<PhotoHistory> {
    const [eventsResult, stateResult] = await Promise.all([
      this.db.query<SelectionEvent>(
        `SELECT * FROM selection_events
         WHERE tenant_id=$1 AND photo_id=$2
         ORDER BY occurred_at ASC`,
        [tenantId, photoId],
      ),
      this.db.query<{ current_flag: string; change_count: number }>(
        `SELECT current_flag, change_count FROM photo_selection_state
         WHERE photo_id=$1`,
        [photoId],
      ),
    ])

    return {
      events: eventsResult.rows,
      currentFlag: stateResult.rows[0]?.current_flag ?? 'NONE',
      changeCount: stateResult.rows[0]?.change_count ?? 0,
    }
  }

  /**
   * Aggregate selection statistics for a wedding.
   */
  async getSelectionStats(
    tenantId: string,
    weddingId: string,
  ): Promise<SelectionStats> {
    const [countsResult, contributorsResult] = await Promise.all([
      this.db.query<{
        total_photos: string
        favorite_count: string
        must_have_count: string
        rejected_count: string
        unflagged_count: string
      }>(
        `SELECT
           COUNT(*) AS total_photos,
           SUM(CASE WHEN current_flag = 'FAVORITE'  THEN 1 ELSE 0 END) AS favorite_count,
           SUM(CASE WHEN current_flag = 'MUST_HAVE' THEN 1 ELSE 0 END) AS must_have_count,
           SUM(CASE WHEN current_flag = 'REJECTED'  THEN 1 ELSE 0 END) AS rejected_count,
           SUM(CASE WHEN current_flag = 'NONE'      THEN 1 ELSE 0 END) AS unflagged_count
         FROM photo_selection_state
         WHERE tenant_id=$1 AND wedding_id=$2`,
        [tenantId, weddingId],
      ),
      this.db.query<{ user_id: string; name: string; event_count: string }>(
        `SELECT
           se.actor_id AS user_id,
           CONCAT(u.first_name, ' ', u.last_name) AS name,
           COUNT(*) AS event_count
         FROM selection_events se
         JOIN users u ON u.id = se.actor_id
         WHERE se.tenant_id=$1 AND se.wedding_id=$2 AND se.actor_id IS NOT NULL
         GROUP BY se.actor_id, u.first_name, u.last_name
         ORDER BY event_count DESC
         LIMIT 10`,
        [tenantId, weddingId],
      ),
    ])

    const counts = countsResult.rows[0]!

    return {
      totalPhotos:   parseInt(counts.total_photos, 10),
      favoriteCount: parseInt(counts.favorite_count, 10),
      mustHaveCount: parseInt(counts.must_have_count, 10),
      rejectedCount: parseInt(counts.rejected_count, 10),
      unflaggedCount: parseInt(counts.unflagged_count, 10),
      topContributors: contributorsResult.rows.map(r => ({
        userId:     r.user_id,
        name:       r.name,
        eventCount: parseInt(r.event_count, 10),
      })),
    }
  }

  /**
   * Timeline of selection activity — useful for analytics charts.
   * Returns event counts grouped by day.
   */
  async getSelectionTimeline(
    tenantId: string,
    weddingId: string,
    days = 30,
  ): Promise<{ date: string; count: number; byType: Record<string, number> }[]> {
    const { rows } = await this.db.query<{
      date: string
      event_type: string
      count: string
    }>(
      `SELECT
         DATE(occurred_at) AS date,
         event_type,
         COUNT(*) AS count
       FROM selection_events
       WHERE tenant_id=$1 AND wedding_id=$2
         AND occurred_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(occurred_at), event_type
       ORDER BY date ASC`,
      [tenantId, weddingId],
    )

    // Group by date
    const byDate = new Map<string, { count: number; byType: Record<string, number> }>()
    for (const row of rows) {
      const entry = byDate.get(row.date) ?? { count: 0, byType: {} }
      entry.count += parseInt(row.count, 10)
      entry.byType[row.event_type] = (entry.byType[row.event_type] ?? 0) + parseInt(row.count, 10)
      byDate.set(row.date, entry)
    }

    return Array.from(byDate.entries()).map(([date, data]) => ({ date, ...data }))
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private computeRowHash(params: AppendEventParams): string {
    const data = [
      params.tenantId,
      params.weddingId,
      params.photoId ?? '',
      params.actorId ?? '',
      params.eventType,
      JSON.stringify(params.payload ?? {}),
    ].join('|')

    return createHash('sha256').update(data).digest('hex')
  }
}
