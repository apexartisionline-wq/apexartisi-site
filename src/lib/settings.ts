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
  // Ομάδες της εβδομάδας. Η εναλλαγή είναι λίστα θεραπευτών: μία εβδομάδα ο πρώτος,
  // την επόμενη ο δεύτερος κ.ο.κ. (αρχή μέτρησης: groupRotationAnchor).
  groups: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      time,
      rotation: z.array(z.string()),
    }),
  ),
  groupRotationAnchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupsPerCycle: z.number().int().min(1),
  groupJoinBeforeMinutes: z.number().int().min(0),
  groupDurationMinutes: z.number().int().min(1),
  groupRoomUrl: z.string(),
  journalTime: time,
  // Σύνδεσμος Google Form για το ημερολόγιο. Το {code} αντικαθίσταται με τον κωδικό μέλους.
  // Κενό = το ημερολόγιο γίνεται μέσα στο app.
  journalFormUrl: z.string(),
  bookingDay: z.number().int().min(0).max(6),
  bookingOpenTime: time,
  bookingCloseTime: time,
  sessionsPerWeek: z.number().int().min(1),
  cycleLength: z.number().int().min(1),
  sessionDays: z.array(z.number().int().min(0).max(6)),
  sessionHours: z.array(z.number().int().min(0).max(23)),
  sessionMinutes: z.number().int().min(1),
  pairMinutes: z.number().int().min(1), // Therapair
  sessionJoinBeforeMinutes: z.number().int().min(0),
  rooms: z.array(z.string()).length(4),
  changeRequestHours: z.number().int().min(0),
  requireStaff2FA: z.boolean(),
  // Η λίστα έναρξης συνεργασίας «κλειδώνει» το app του μέλους μέχρι να ολοκληρωθεί.
  requireIntake: z.boolean(),
  consentVersion: z.string().min(1),
  helpEscalateMinutes: z.number().int().min(1),
  helpTalkMinutes: z.number().int().min(1), // μετά την ανάληψη, ως πότε δηλώνεται «μιλήσαμε»
  helpMaxAlerts: z.number().int().min(1),
  // Αποχή: τόσες μέρες χωρίς ομάδα, ημερολόγιο ή κράτηση → τηλεφώνημα από όποιον θεραπευτή το δει.
  dropoutDays: z.number().int().min(1),
  // Γραμμές βοήθειας, ορατές από την αρχή στο κόκκινο κουμπί και στη σελίδα σύνδεσης.
  helplines: z.array(z.object({ label: z.string(), number: z.string() })),
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
  groups: [
    { weekday: 1, time: "21:00", rotation: [] },
    { weekday: 3, time: "21:00", rotation: [] },
    { weekday: 5, time: "21:00", rotation: [] },
    { weekday: 6, time: "18:00", rotation: [] },
  ],
  groupRotationAnchor: "2026-09-28",
  groupsPerCycle: 16,
  groupJoinBeforeMinutes: 15,
  groupDurationMinutes: 90,
  groupRoomUrl: "",
  journalTime: "20:00",
  journalFormUrl: "",
  bookingDay: 1,
  bookingOpenTime: "00:00",
  bookingCloseTime: "21:00",
  sessionsPerWeek: 2,
  cycleLength: 8,
  sessionDays: [2, 4],
  sessionHours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
  sessionMinutes: 40,
  pairMinutes: 55,
  sessionJoinBeforeMinutes: 10,
  rooms: ["", "", "", ""],
  changeRequestHours: 12,
  requireStaff2FA: true,
  requireIntake: true,
  consentVersion: "σχέδιο 2026-09",
  helpEscalateMinutes: 10,
  helpTalkMinutes: 5,
  helpMaxAlerts: 6,
  dropoutDays: 3,
  // Να επιβεβαιωθούν από την Εύα πριν τη δοκιμή.
  helplines: [
    { label: "Έκτακτη ανάγκη", number: "112" },
    { label: "Γραμμή για την αυτοκτονία (Κλίμακα)", number: "1018" },
    { label: "Γραμμή ψυχοκοινωνικής υποστήριξης", number: "10306" },
    { label: "Γραμμή για εξαρτήσεις", number: "1031" },
  ],
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
