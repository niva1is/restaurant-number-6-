import { z } from 'zod';

export const eventIdParamSchema = z.object({
  eventId: z.string().uuid('eventId должен быть UUID'),
});
