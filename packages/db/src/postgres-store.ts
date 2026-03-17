import { Pool } from "pg";
import type { Persona1Repository } from "./repository.js";
import type {
  FewShotExampleRecord,
  InteractionRecord,
  MirrorInsightRecord,
  PersonaRecord,
  PersonaShardRecord,
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

  async getUserByFirebaseUid(firebaseUid: string) {
    const result = await this.#pool.query("select * from users where firebase_uid = $1 limit 1", [firebaseUid]);
    if (!result.rows[0]) {
      return null;
    }

    return mapUser(result.rows[0]);
  }

  async saveUser(user: UserRecord) {
    await this.#pool.query(
      `insert into users (
        user_id, email, firebase_uid, plan, auth_mode, usage_count, performance_mu, performance_sigma,
        performance_ordinal, performance_matches, stripe_customer_id, stripe_subscription_id, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      on conflict (user_id) do update set
        email = excluded.email,
        firebase_uid = excluded.firebase_uid,
        plan = excluded.plan,
        auth_mode = excluded.auth_mode,
        usage_count = excluded.usage_count,
        performance_mu = excluded.performance_mu,
        performance_sigma = excluded.performance_sigma,
        performance_ordinal = excluded.performance_ordinal,
        performance_matches = excluded.performance_matches,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        updated_at = excluded.updated_at`,
      [
        user.userId,
        user.email,
        user.firebaseUid,
        user.plan,
        user.authMode,
        user.usageCount,
        user.performanceMu,
        user.performanceSigma,
        user.performanceOrdinal,
        user.performanceMatches,
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
        , embedding
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      on conflict (interaction_id) do update set
        draft_final = excluded.draft_final,
        chosen_option_id = excluded.chosen_option_id,
        outcome = excluded.outcome,
        observed_signals = excluded.observed_signals,
        metadata_json = excluded.metadata_json,
        embedding = excluded.embedding`,
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
        interaction.createdAt,
        interaction.embedding ? JSON.stringify(interaction.embedding) : null
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
      embedding: row.embedding,
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

  async savePersonaShards(userId: string, shards: PersonaShardRecord[]) {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from persona_shards where user_id = $1", [userId]);
      for (const shard of shards) {
        await client.query(
          `insert into persona_shards (
            shard_id, user_id, shard_type, content, embedding, platform, recipient_archetype, confidence,
            data_point_count, created_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            shard.shardId,
            userId,
            shard.shardType,
            shard.content,
            shard.embedding ? JSON.stringify(shard.embedding) : null,
            shard.platform,
            shard.recipientArchetype,
            shard.confidence,
            shard.dataPointCount,
            shard.createdAt,
            shard.updatedAt
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

  async listPersonaShards(userId: string) {
    const result = await this.#pool.query(
      "select * from persona_shards where user_id = $1 order by updated_at desc",
      [userId]
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      shardId: row.shard_id,
      userId: row.user_id,
      shardType: row.shard_type,
      content: row.content,
      embedding: row.embedding,
      platform: row.platform,
      recipientArchetype: row.recipient_archetype,
      confidence: Number(row.confidence),
      dataPointCount: Number(row.data_point_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })) as PersonaShardRecord[];
  }

  async saveFewShotExamples(examples: FewShotExampleRecord[]) {
    for (const example of examples) {
      await this.#pool.query(
        `insert into few_shot_examples (
          example_id, preset, recipient_archetype, situation_description, example_content,
          outcome_signal, source, embedding, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (example_id) do update set
          preset = excluded.preset,
          recipient_archetype = excluded.recipient_archetype,
          situation_description = excluded.situation_description,
          example_content = excluded.example_content,
          outcome_signal = excluded.outcome_signal,
          source = excluded.source,
          embedding = excluded.embedding`,
        [
          example.exampleId,
          example.preset,
          example.recipientArchetype,
          example.situationDescription,
          example.exampleContent,
          example.outcomeSignal,
          example.source,
          example.embedding ? JSON.stringify(example.embedding) : null,
          example.createdAt
        ]
      );
    }
  }

  async listFewShotExamples(filters?: {
    preset?: string;
    recipientArchetype?: string | null;
  }) {
    const conditions: string[] = [];
    const values: Array<string | null> = [];
    if (filters?.preset) {
      values.push(filters.preset);
      conditions.push(`preset = $${values.length}`);
    }
    if (filters && "recipientArchetype" in filters && filters.recipientArchetype !== undefined) {
      values.push(filters.recipientArchetype);
      conditions.push(`recipient_archetype is not distinct from $${values.length}`);
    }
    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const result = await this.#pool.query(
      `select * from few_shot_examples ${where} order by created_at desc`,
      values
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      exampleId: row.example_id,
      preset: row.preset,
      recipientArchetype: row.recipient_archetype,
      situationDescription: row.situation_description,
      exampleContent: row.example_content,
      outcomeSignal: row.outcome_signal,
      source: row.source,
      embedding: row.embedding,
      createdAt: row.created_at
    })) as FewShotExampleRecord[];
  }
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    userId: row.user_id as string,
    email: row.email as string,
    firebaseUid: (row.firebase_uid as string | null) ?? null,
    plan: row.plan as UserRecord["plan"],
    authMode: row.auth_mode as UserRecord["authMode"],
    usageCount: row.usage_count as number,
    performanceMu: (row.performance_mu as number | null) ?? null,
    performanceSigma: (row.performance_sigma as number | null) ?? null,
    performanceOrdinal: (row.performance_ordinal as number | null) ?? null,
    performanceMatches: (row.performance_matches as number | null) ?? null,
    stripeCustomerId: (row.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId: (row.stripe_subscription_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}
