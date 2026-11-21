import { prisma } from "./db";
import type { AccountStatus } from "./auth";

export async function listUsersForAdmin() {
  const users = await prisma.profile.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const spend = await prisma.apiUsage.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: since30 } },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    _count: true,
  });
  const byUser = new Map(spend.map((s) => [s.userId, s]));
  const masterCounts = await prisma.masterResume.groupBy({
    by: ["userId"],
    _count: true,
  });
  const masters = new Map(masterCounts.map((m) => [m.userId, m._count]));

  return users.map((u) => {
    const s = byUser.get(u.id);
    return {
      ...u,
      masters: masters.get(u.id) ?? 0,
      calls30d: s?._count ?? 0,
      cost30d: s?._sum.costUsd ?? 0,
      inputTokens30d: s?._sum.inputTokens ?? 0,
      outputTokens30d: s?._sum.outputTokens ?? 0,
    };
  });
}

export async function setUserStatus(userId: string, status: AccountStatus) {
  const data: { status: AccountStatus; approvedAt?: Date | null; role?: string } = { status };
  if (status === "active") data.approvedAt = new Date();
  return prisma.profile.update({ where: { id: userId }, data });
}

export async function usageSummary() {
  const now = Date.now();
  const day = new Date(now - 86_400_000);
  const week = new Date(now - 7 * 86_400_000);
  const month = new Date(now - 30 * 86_400_000);

  const [today, last7, last30, byKind, recent] = await Promise.all([
    prisma.apiUsage.aggregate({ where: { createdAt: { gte: day } }, _sum: { costUsd: true }, _count: true }),
    prisma.apiUsage.aggregate({ where: { createdAt: { gte: week } }, _sum: { costUsd: true }, _count: true }),
    prisma.apiUsage.aggregate({ where: { createdAt: { gte: month } }, _sum: { costUsd: true }, _count: true }),
    prisma.apiUsage.groupBy({
      by: ["kind"],
      where: { createdAt: { gte: month } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.apiUsage.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        userId: true,
        kind: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        createdAt: true,
      },
    }),
  ]);

  const emails = await prisma.profile.findMany({
    where: { id: { in: [...new Set(recent.map((r) => r.userId))] } },
    select: { id: true, email: true },
  });
  const emailById = new Map(emails.map((e) => [e.id, e.email]));

  return {
    today: { cost: today._sum.costUsd ?? 0, calls: today._count },
    last7: { cost: last7._sum.costUsd ?? 0, calls: last7._count },
    last30: { cost: last30._sum.costUsd ?? 0, calls: last30._count },
    byKind: byKind.map((k) => ({ kind: k.kind, cost: k._sum.costUsd ?? 0, calls: k._count })),
    recent: recent.map((r) => ({ ...r, email: emailById.get(r.userId) ?? "" })),
  };
}

export function money(n: number): string {
  return `$${n.toFixed(n >= 1 ? 2 : 4)}`;
}
