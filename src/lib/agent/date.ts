import { config } from "../config";
import { q } from "../db";
import { structured } from "../llm";
import { getDate, getPerson, getProfile, type DateRow, type TurnRecord } from "../repo";
import type { PersonRow } from "../types";
import { agentSystem, firstName, publicCard } from "./persona";
import { Debrief, Invite, InviteReply, Scenes, SpeedVerdict, Turn, clamp, type Profile } from "./schemas";

// The date harness. Two agents, each holding only its own person's dossier,
// take turns speaking. Each turn is a separate call made *as that agent*: it
// sees its own dossier, the other person's public card, the spoken
// conversation so far and its own earlier private notes — never the other
// agent's notes or dossier. That information asymmetry is what makes it a date
// rather than a compatibility calculation.

type Side = { person: PersonRow; profile: Profile; name: string; system: string };

const now = () => new Date().toISOString();

async function append(dateId: string, rec: TurnRecord, stage?: string) {
  await q(`UPDATE dates SET turns = turns || $2::jsonb, stage = COALESCE($3, stage) WHERE id = $1`, [dateId, JSON.stringify([rec]), stage ?? null]);
}

async function setStage(dateId: string, stage: string) {
  await q(`UPDATE dates SET stage=$2 WHERE id=$1`, [dateId, stage]);
}

// The conversation as one agent experiences it.
function transcriptFor(me: "a" | "b", turns: TurnRecord[], names: { a: string; b: string }): string {
  const other = me === "a" ? names.b : names.a;
  const lines: string[] = [];
  for (const t of turns) {
    if (t.kind === "scene") lines.push(`[scene] ${t.text}`);
    else if (t.kind === "invite")
      lines.push(
        `${t.speaker === me ? "You" : other} (invite): "${t.message}" — plan: ${t.plan.activity} at ${t.plan.place}, ${t.plan.area}, ${t.plan.time}`,
      );
    else if (t.kind === "reply") lines.push(`${t.speaker === me ? "You" : other} (reply): "${t.message}"`);
    else {
      const who = t.speaker === me ? "You" : other;
      const g = t.gesture ? ` (${t.gesture})` : "";
      const note = t.speaker === me ? `   [your private note then: ${t.private_note}]` : "";
      lines.push(`${who}: "${t.say}"${g}${note}`);
    }
  }
  return lines.join("\n");
}

function phaseFor(i: number, total: number, side: Side): string {
  if (i < 2) return "Opening. Say hello, react to the setting, and open with something specific from their card. Light and warm.";
  if (i < Math.floor(total * 0.55))
    return `Getting to know each other. Share specific, true things about ${side.name} from your talking points, ask about their life, and follow up on what they just said.`;
  if (i < total - 2)
    return `Going deeper. Naturally steer toward what you must find out for ${side.name}: ${side.profile.agent_brief.must_probe.join(" / ")}. One thing at a time, and respond to their answers.`;
  return `Wrapping up — the date is ending. Be honest about how it went for ${side.name}. If it went well, suggest a concrete second date; if not, be kind and warm without promising one.`;
}

async function loadSide(id: string): Promise<Side> {
  const person = await getPerson(id);
  const profile = await getProfile(id);
  if (!person || !profile) throw new Error(`Person ${id} has no profile yet`);
  return { person, profile, name: firstName(person, profile), system: agentSystem(person, profile) };
}

async function speak(side: Side, other: Side, me: "a" | "b", d: { kind: string; setting: string }, turns: TurnRecord[], instruction: string, model: string) {
  const names = me === "a" ? { a: side.name, b: other.name } : { a: other.name, b: side.name };
  const out = await structured({
    model,
    purpose: `date:${d.kind}:turn`,
    system: side.system,
    cacheKey: `agent:${side.person.id}`,
    effort: "low",
    maxTokens: 4000,
    schema: Turn,
    content: `<date kind="${d.kind}">\n${d.setting}\n</date>\n\n<their_public_card>\n${publicCard(other.person, other.profile)}\n</their_public_card>\n\n<conversation_so_far>\n${transcriptFor(me, turns, names) || "(nothing yet — you speak first)"}\n</conversation_so_far>\n\nNow: ${instruction}\nIt's your turn to speak as ${side.name}'s stand-in.`,
  });
  return { ...out, vibe: clamp(out.vibe, -2, 2) };
}

// ---------------- speed date ----------------

export async function runSpeedDate(dateId: string) {
  const d = await getDate(dateId);
  if (!d) throw new Error("date not found");
  const [A, B] = await Promise.all([loadSide(d.a_id), loadSide(d.b_id)]);
  await q(`UPDATE dates SET status='running', started_at=now(), turns='[]'::jsonb, plan=$2::jsonb WHERE id=$1`, [
    dateId,
    JSON.stringify({ setting: "Proxima speed-dating night: one table, four minutes, then the bell." }),
  ]);
  const setting = `Speed dating at Proxima: one small table, four minutes, two messages each, then the bell rings. Make the minutes count — one specific opener, then go for whatever matters most to your person.`;
  const turns: TurnRecord[] = [{ kind: "scene", text: `${A.name} and ${B.name} sit down at table ${(Math.abs(hash(d.pair_key)) % 24) + 1}. The timer starts.`, at: now() }];
  await append(dateId, turns[0], "talking");
  const total = config.speedDateTurns;
  for (let i = 0; i < total; i++) {
    const me = i % 2 === 0 ? "a" : "b";
    const [side, other] = me === "a" ? [A, B] : [B, A];
    const instruction =
      i < 2
        ? "Open with something specific from their card and ask one real question."
        : `Last message before the bell. Respond to what they said and test the thing that matters most to ${side.name}.`;
    const t = await speak(side, other, me, { kind: "speed date", setting }, turns, instruction, config.models.speed);
    const rec: TurnRecord = { kind: "turn", speaker: me, at: now(), ...t };
    turns.push(rec);
    await append(dateId, rec);
  }
  const bell: TurnRecord = { kind: "scene", text: "The bell rings.", at: now() };
  turns.push(bell);
  await append(dateId, bell, "verdicts");

  const verdict = async (side: Side, other: Side, me: "a" | "b") => {
    const names = me === "a" ? { a: side.name, b: other.name } : { a: other.name, b: side.name };
    const v = await structured({
      model: config.models.speed,
      purpose: "date:speed:verdict",
      system: side.system,
      cacheKey: `agent:${side.person.id}`,
      effort: "low",
      maxTokens: 3000,
      schema: SpeedVerdict,
      content: `<their_public_card>\n${publicCard(other.person, other.profile)}\n</their_public_card>\n\n<speed_date>\n${transcriptFor(me, turns, names)}\n</speed_date>\n\nThe four minutes are up. Give your private verdict for ${side.name}: would ${other.name} be good for ${side.name}? Judge from ${side.name}'s needs and dealbreakers, using both what was said and their card. Calibrate the fit: 50 = unclear/neutral, 65+ = worth a real date, 80+ = rare, strong fit. Most pairs land between 30 and 70.`,
    });
    return { ...v, fit: clamp(v.fit, 0, 100) };
  };
  const [va, vb] = await Promise.all([verdict(A, B, "a"), verdict(B, A, "b")]);
  await q(`UPDATE dates SET verdict_a=$2::jsonb, verdict_b=$3::jsonb, fit_ab=$4, fit_ba=$5, status='done', stage='done', finished_at=now() WHERE id=$1`, [
    dateId,
    JSON.stringify(va),
    JSON.stringify(vb),
    va.fit,
    vb.fit,
  ]);
}

// ---------------- full date ----------------

const NARRATOR = `You are the narrator of Proxima date nights. You write short, vivid, present-tense scene lines for a date between two people's AI agents, grounded in the plan they agreed on. Specific and sensory, never cheesy. Never describe anyone's looks or body. Don't put words in anyone's mouth.`;

export async function runFullDate(dateId: string) {
  const d = await getDate(dateId);
  if (!d) throw new Error("date not found");
  const [A, B] = await Promise.all([loadSide(d.a_id), loadSide(d.b_id)]);
  await q(`UPDATE dates SET status='running', started_at=now(), turns='[]'::jsonb, stage='asking' WHERE id=$1`, [dateId]);
  const turns: TurnRecord[] = [];

  // 1. A asks B out, with a concrete plan built from B's card and A's person.
  const invite = await structured({
    model: config.models.date,
    purpose: "date:full:invite",
    system: A.system,
    cacheKey: `agent:${A.person.id}`,
    effort: "low",
    maxTokens: 4000,
    schema: Invite,
    content: `You matched with ${B.name} at speed dating and you're asking them out on ${A.name}'s behalf.\n\n<their_public_card>\n${publicCard(B.person, B.profile)}\n</their_public_card>\n\nPropose one specific first date that both ${A.name} and ${B.name} would genuinely enjoy, given ${A.name}'s life and what's on their card. Write the invite in ${A.name}'s voice.`,
  });
  const inviteRec: TurnRecord = { kind: "invite", speaker: "a", message: invite.message, plan: invite.plan, at: now() };
  turns.push(inviteRec);
  await append(dateId, inviteRec, "replying");

  const reply = await structured({
    model: config.models.date,
    purpose: "date:full:reply",
    system: B.system,
    cacheKey: `agent:${B.person.id}`,
    effort: "low",
    maxTokens: 3000,
    schema: InviteReply,
    content: `${A.name}'s agent is asking ${B.name} out.\n\n<their_public_card>\n${publicCard(A.person, A.profile)}\n</their_public_card>\n\n<invite>\n"${invite.message}"\nPlan: ${invite.plan.activity} at ${invite.plan.place}, ${invite.plan.area}, ${invite.plan.time}.\n</invite>\n\nReply in ${B.name}'s voice. Accept; suggest one small tweak only if it clearly suits ${B.name}.`,
  });
  const replyRec: TurnRecord = { kind: "reply", speaker: "b", message: reply.message, tweak: reply.tweak, at: now() };
  turns.push(replyRec);
  await append(dateId, replyRec, "setting the scene");

  const scenes = await structured({
    model: config.models.date,
    purpose: "date:full:scenes",
    system: NARRATOR,
    effort: "low",
    maxTokens: 3000,
    schema: Scenes,
    content: `Plan: ${invite.plan.activity} at ${invite.plan.place}, ${invite.plan.area}, ${invite.plan.time}.${reply.tweak ? ` Tweak agreed: ${reply.tweak}.` : ""}\nWhy it fits: ${invite.plan.why_this_fits}\nThe two people: ${A.name} (${A.profile.city}) and ${B.name} (${B.profile.city}).\nWrite the opening, midpoint and closing scene lines.`,
  });
  await q(`UPDATE dates SET plan=$2::jsonb WHERE id=$1`, [dateId, JSON.stringify({ invite, scenes })]);

  const setting = `First date. ${invite.plan.activity} at ${invite.plan.place}, ${invite.plan.area}, ${invite.plan.time}.${reply.tweak ? ` (Tweak: ${reply.tweak})` : ""}`;
  const total = config.fullDateTurns;
  const mid = Math.floor(total / 2);
  const opening: TurnRecord = { kind: "scene", text: scenes.opening, at: now() };
  turns.push(opening);
  await append(dateId, opening, "on the date");

  for (let i = 0; i < total; i++) {
    if (i === mid) {
      const s: TurnRecord = { kind: "scene", text: scenes.midpoint, at: now() };
      turns.push(s);
      await append(dateId, s);
    }
    if (i === total - 2) {
      const s: TurnRecord = { kind: "scene", text: scenes.closing, at: now() };
      turns.push(s);
      await append(dateId, s, "saying goodnight");
    }
    // B (the one who was asked) speaks first on arrival.
    const me = i % 2 === 0 ? "b" : "a";
    const [side, other] = me === "a" ? [A, B] : [B, A];
    const t = await speak(side, other, me, { kind: "first date", setting }, turns, phaseFor(i, total, side), config.models.date);
    const rec: TurnRecord = { kind: "turn", speaker: me, at: now(), ...t };
    turns.push(rec);
    await append(dateId, rec);
  }
  await setStage(dateId, "debrief");

  const debrief = async (side: Side, other: Side, me: "a" | "b") => {
    const names = me === "a" ? { a: side.name, b: other.name } : { a: other.name, b: side.name };
    const r = await structured({
      model: config.models.debrief,
      purpose: "date:full:debrief",
      system: side.system,
      cacheKey: `agent:${side.person.id}`,
      effort: "medium",
      maxTokens: 8000,
      schema: Debrief,
      content: `<their_public_card>\n${publicCard(other.person, other.profile)}\n</their_public_card>\n\n<the_date>\n${transcriptFor(me, turns, names)}\n</the_date>\n\nThe date is over. Write your private debrief for ${side.name}. Go through each of ${side.name}'s needs (from your dossier) and each likely dealbreaker against what actually happened. Quote the best moment verbatim. Calibrate the fit honestly: 50 = unclear/neutral, 65+ = you'd recommend a second date, 80+ = rare, strong fit on needs and values. Don't inflate.`,
    });
    const s = r.scores;
    return {
      ...r,
      fit: clamp(r.fit, 0, 100),
      scores: {
        shared_interests: clamp(s.shared_interests, 0, 10),
        values_alignment: clamp(s.values_alignment, 0, 10),
        lifestyle_fit: clamp(s.lifestyle_fit, 0, 10),
        conversation_chemistry: clamp(s.conversation_chemistry, 0, 10),
        needs_met: clamp(s.needs_met, 0, 10),
      },
    };
  };
  const [da, db] = await Promise.all([debrief(A, B, "a"), debrief(B, A, "b")]);
  await q(`UPDATE dates SET verdict_a=$2::jsonb, verdict_b=$3::jsonb, fit_ab=$4, fit_ba=$5, status='done', stage='done', finished_at=now() WHERE id=$1`, [
    dateId,
    JSON.stringify(da),
    JSON.stringify(db),
    da.fit,
    db.fit,
  ]);
}

export async function runDate(dateId: string) {
  const d = await getDate(dateId);
  if (!d) throw new Error("date not found");
  if (d.status === "done") return;
  try {
    if (d.kind === "speed") await runSpeedDate(dateId);
    else await runFullDate(dateId);
  } catch (e) {
    await q(`UPDATE dates SET status='error', error=$2 WHERE id=$1`, [dateId, String((e as Error).message ?? e).slice(0, 500)]);
    throw e;
  }
}

export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export type { DateRow };
