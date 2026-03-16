import { Pool } from "pg";
import type { Persona1Repository } from "./repository.js";
import type {
  InteractionRecord,
  MirrorInsightRecord,
  PersonaRecord,
  UserRecord
} from "./types.js";

export class PostgresPersona1Repository implements Persona1Repository {
  readonly #pool: Pool;

  constructor(databaseUrl: string) {
    this.#pool = new Pool({ connectionString: databaseUrl });
  }

  async getUser(userId: string) {
    const result = await this.#pool.query("select * from users where user_id = $1 limit 1", [userId]);
    if (!result.rows[0]) {
      return null;
    }

    return mapUser(result.rows[0]);
  }

  async getUserByEmail(email: string) {
    const result = await this.#pool.query("select * from users where lower(email) = lower($1) limit 1", [email]);
    if (!result.rows[0]) {
      return null;
    }

    return mapUser(result.rows[0]);
  }

  async saveUser(user: UserRecord) {
    await this.#pool.query(
      `insert into users (
        user_id, email, plan, auth_mode, usage_count, stripe_customer_id, stripe_subscription_id, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (user_id) do update set
        email = excluded.email,
        plan = excluded.plan,
        auth_mode = excluded.auth_mode,
        usage_count = excluded.usage_count,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        updated_at = excluded.updated_at`,
      [
        user.userId,
        user.email,
        user.plan,
        user.authMode,
        user.usageCount,
        user.stripeCustomerId,
        user.stripeSubscriptionId,
        user.createdAt,
        user.updatedAt
      ]
    );
  }

  async incrementUsage(userId: string, now: string) {
    const result = await this.#pool.query(
      "update users set usage_count = usage_count + 1, updated_at = $2 where user_id = $1 returning *",
      [userId, now]
    );

    if (!result.rows[0]) {
      throw new Error(`Cannot increment usage for unknown user ${userId}.`);
    }

    return mapUser(result.rows[0]);
  }

  async getPersona(userId: string) {
    const result = await this.#pool.query("select * from personas where user_id = $1 limit 1", [userId]);
    if (!result.rows[0]) {
      return null;
    }

    return {
      userId: result.rows[0].user_id as string,
      profile: result.rows[0].profile_json as PersonaRecord["profile"],
      updatedAt: result.rows[0].updated_at as string
    };
  }

  async savePersona(persona: PersonaRecord) {
    await this.#pool.query(
      `insert into personas (user_id, profile_json, updated_at)
      values ($1, $2, $3)
      on conflict (user_id) do update set
        profile_json = excluded.profile_json,
        updated_at = excluded.updated_at`,
      [persona.userId, JSON.stringify(persona.profile), persona.updatedAt]
    );
  }

  async saveInteraction(interaction: InteractionRecord) {
    await this.#pool.query(
      `insert into interactions (
        interaction_id, user_id, session_id, platform, preset, draft_raw, draft_final, chosen_option_id,
        recipient_context_hash, outcome, observed_signals, metadata_json, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict (interaction_id) do update set
        draft_final = excluded.draft_final,
        chosen_option_id = excluded.chosen_option_id,
        outcome = excluded.outcome,
        observed_signals = excluded.observed_signals,
        metadata_json = excluded.metadata_json`,
      [
        interaction.interactionId,
        interaction.userId,
        interaction.sessionId,
        interaction.platform,
        interaction.preset,
        interaction.draftRaw,
        interaction.draftFinal,
        interaction.chosenOptionId,
        interaction.recipientContextHash,
        interaction.outcome,
        interaction.observedSignals,
        JSON.stringify(interaction.metadata),
        interaction.createdAt
      ]
    );
  }

  async listInteractions(userId: string) {
    const result = await this.#pool.query(
      "select * from interactions where user_id = $1 order by created_at asc",
      [userId]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      interactionId: row.interaction_id,
      userId: row.user_id,
      sessionId: row.session_id,
      platform: row.platform,
      preset: row.preset,
      draftRaw: row.draft_raw,
      draftFinal: row.draft_final,
      chosenOptionId: row.chosen_option_id,
      recipientContextHash: row.recipient_context_hash,
      outcome: row.outcome,
      observedSignals: row.observed_signals,
      metadata: row.metadata_json,
      createdAt: row.created_at
    })) as InteractionRecord[];
  }

  async saveMirrorInsights(userId: string, insights: MirrorInsightRecord[]) {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from mirror_insights where user_id = $1", [userId]);

      for (const insight of insights) {
        await client.query(
          `insert into mirror_insights (
            insight_id, user_id, observation, supporting_pattern, evidence_count, confidence, created_at, updated_at, status
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            insight.insightId,
            userId,
            insight.observation,
            insight.supportingPattern,
            insight.evidenceCount,
            insight.confidence,
            insight.createdAt,
            insight.updatedAt,
            insight.status
          ]
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listMirrorInsights(userId: string) {
    const result = await this.#pool.query(
      "select * from mirror_insights where user_id = $1 order by created_at desc",
      [userId]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      insightId: row.insight_id,
      userId: row.user_id,
      observation: row.observation,
      supportingPattern: row.supporting_pattern,
      evidenceCount: row.evidence_count,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status
    })) as MirrorInsightRecord[];
  }
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    userId: row.user_id as string,
    email: row.email as string,
    plan: row.plan as UserRecord["plan"],
    authMode: row.auth_mode as UserRecord["authMode"],
    usageCount: row.usage_count as number,
    stripeCustomerId: (row.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId: (row.stripe_subscription_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}
