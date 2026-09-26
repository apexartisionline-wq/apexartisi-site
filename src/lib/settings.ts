import { z } from "zod";
import { prisma } from "./db";

// Ονόματα, λογότυπο και πρόγραμμα είναι ρυθμίσεις — όχι «καρφωμένα» στον κώδικα.
const time = z.string().regex(/^\d{2}:\d{2}$/);

export const settingsSchema = z.object({
  appName: z.string().min(1),
  orgName: z.string().min(1),
  logoUrl: z.string(),
  dailyTextTime: time,
  formsDays: z.array(z.number().int().min(0).max(6)),
  formsTime: time,
  groupDays: z.array(z.number().int().min(0).max(6)),
  groupTime: time,
  groupJoinBeforeMinutes: z.number().int().min(0),
  groupDurationMinutes: z.number().int().min(1),
  groupRoomUrl: z.string(),
  journalTime: time,
  bookingDay: z.number().int().min(0).max(6),
  bookingOpenTime: time,
  bookingCloseTime: time,
  sessionsPerWeek: z.number().int().min(1),
  cycleLength: z.number().int().min(1),
  sessionHours: z.array(z.number().int().min(0).max(23)),
  sessionMinutes: z.number().int().min(1),
  sessionJoinBeforeMinutes: z.number().int().min(0),
  rooms: z.array(z.string()).length(4),
  helpEscalateMinutes: z.number().int().min(1),
  helplineText: z.string(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  appName: "Apex",
  orgName: "apex/rtisi online",
  logoUrl: "",
  dailyTextTime: "09:00",
  formsDays: [1, 3, 5],
  formsTime: "09:30",
  groupDays: [1, 3, 5],
  groupTime: "18:00",
  groupJoinBeforeMinutes: 15,
  groupDurationMinutes: 90,
  groupRoomUrl: "",
  journalTime: "20:00",
  bookingDay: 1,
  bookingOpenTime: "00:00",
  bookingCloseTime: "21:00",
  sessionsPerWeek: 2,
  cycleLength: 8,
  sessionHours: [10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21],
  sessionMinutes: 50,
  sessionJoinBeforeMinutes: 10,
  rooms: ["", "", "", ""],
  helpEscalateMinutes: 10,
  // Ανοιχτό θέμα: ποια γραμμή βοήθειας εμφανίζεται (εκτός από το 112).
  helplineText: "Κάλεσε το 112.",
};

const KEY = "app";

export async function getSettings(): Promise<Settings> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const merged = { ...DEFAULT_SETTINGS, ...((row?.value as object) ?? {}) };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(s: Settings): Promise<void> {
  const value = settingsSchema.parse(s);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}
