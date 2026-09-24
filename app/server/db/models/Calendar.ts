import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId, touch } from './schema-parts';

const monthSchema = z.object({
  name: z.string(),
  days: z.number(),
  isIntercalary: z.boolean().default(false),
});
const leapSchema = z.object({
  name: z.string().nullish(),
  monthIndex: z.number().nullish(),
  interval: z.number().nullish(),
  offset: z.number().nullish(),
  addDays: z.number().nullish(),
});
const moonSchema = z.object({
  name: z.string().nullish(),
  cycleLength: z.number().nullish(),
  offsetDays: z.number().nullish(),
  color: z.string().nullish(),
});
const seasonSchema = z.object({
  name: z.string().nullish(),
  startMonthIndex: z.number().nullish(),
  startDay: z.number().nullish(),
  color: z.string().nullish(),
});
const holidaySchema = z.object({
  name: z.string().nullish(),
  monthIndex: z.number().nullish(),
  day: z.number().nullish(),
  color: z.string().nullish(),
});
const calDateSchema = z.object({
  year: z.number().nullish(),
  monthIndex: z.number().nullish(),
  day: z.number().nullish(),
});

export const calendarSchema = z.object({
  _id: objectId,
  name: z.string(),
  description: z.string().default(''),
  months: z.array(monthSchema).default([]),
  weekdays: z.array(z.string()).default([]),
  weekdayMode: z.enum(['continuous', 'resetEachMonth']).default('continuous'),
  // A nested path in Mongoose, so it always exists.
  epoch: z
    .object({ year: z.number().default(1), weekdayIndex: z.number().default(0) })
    .default({ year: 1, weekdayIndex: 0 }),
  yearSuffix: z.string().default(''),
  namedYears: z
    .array(z.object({ year: z.number().nullish(), name: z.string().nullish() }))
    .default([]),
  leapDays: z.array(leapSchema).default([]),
  moons: z.array(moonSchema).default([]),
  seasons: z.array(seasonSchema).default([]),
  holidays: z.array(holidaySchema).default([]),
  currentDate: calDateSchema.default(() => ({ year: 1, monthIndex: 0, day: 1 })),
  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type ICalendar = z.infer<typeof calendarSchema>;

export const Calendar = defineGraphModel<ICalendar>({
  name: 'calendars',
  kind: 'Calendar',
  modelName: 'Calendar',
  schema: calendarSchema,
  index: { campaignId: 'ix_s1' },
  unique: { campaignId: (calendar) => [calendar.campaignId] },
  preSave: touch,
});
