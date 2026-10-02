import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { dateView } from "@/lib/views";
import { DateView } from "./view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await dateView((await params).id);
  return { title: v ? `${v.a.first} & ${v.b.first}` : "Date" };
}

export default async function DatePage({ params }: Props) {
  const v = await dateView((await params).id);
  if (!v) notFound();
  return (
    <DateView
      initial={v.date}
      a={v.a}
      b={v.b}
      needsA={v.profA?.needs.map((n) => n.need) ?? []}
      needsB={v.profB?.needs.map((n) => n.need) ?? []}
    />
  );
}
