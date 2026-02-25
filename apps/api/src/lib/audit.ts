import { db } from '../db/index.js';
import { auditLog } from '../db/schema.js';

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.create'
  | 'user.password_change'
  | 'league.create'
  | 'league.member_add'
  | 'contestant.create'
  | 'episode.create'
  | 'team.add_contestant'
  | 'team.remove_contestant'
  | 'winner_pick.create'
  | 'vote_predictions.update'
  | 'trade.propose'
  | 'trade.accept'
  | 'trade.reject'
  | 'trade.cancel'
  | 'scoring_event.create'
  | 'ledger.credit'
  | 'admin.override_lock';

export async function logAudit(params: {
  actorUserId: number | null;
  actionType: AuditAction | string;
  entityType: string;
  entityId?: number | null;
  beforeJson?: object | null;
  afterJson?: object | null;
  metadataJson?: object | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  await db.insert(auditLog).values({
    actorUserId: params.actorUserId ?? null,
    actionType: params.actionType,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    beforeJson: params.beforeJson ?? null,
    afterJson: params.afterJson ?? null,
    metadataJson: params.metadataJson ?? null,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  });
}
