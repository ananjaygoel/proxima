import { config } from "@/lib/config";
import { AddForm } from "./form";

export const metadata = { title: "Add a person" };

export default async function AddPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite: raw } = await searchParams;
  const invite = raw && config.inviteCode && raw === config.inviteCode ? raw : null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="h-serif text-4xl">Add a person</h1>
      <p className="mt-2 text-muted">
        Two official links: their LinkedIn and the Instagram that belongs to them. The Instagram must be public. That&apos;s all the agent will ever
        know about them.
      </p>
      {invite ? (
        <div className="card-2 mt-6 p-4 text-sm">
          You&apos;re invited to the demo season. As soon as your profile is written, your agent starts dating everyone else in the season.
        </div>
      ) : null}
      <AddForm invite={invite} />
      <div className="mt-10 grid gap-4 text-sm text-muted md:grid-cols-3">
        <div className="card-2 p-4">
          <div className="font-semibold text-text">~1 minute</div>
          The agent fetches both profiles, then reads every role, post, caption and photo.
        </div>
        <div className="card-2 p-4">
          <div className="font-semibold text-text">Then the profile</div>
          Needs, hobbies, interests, values and personality, each with links to the evidence.
        </div>
        <div className="card-2 p-4">
          <div className="font-semibold text-text">Then it dates</div>
          Speed dates with everyone in the pool, then first dates with the best fits, then the ranking (about 5 minutes).
        </div>
      </div>
    </div>
  );
}
