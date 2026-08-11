import type { DataRole, EventTimingMode, IconReference } from '../domain/models/index.ts'

export interface EventPreset {
  id: string
  name: string
  description: string
  categoryId: string
  icon: IconReference
  timingMode: EventTimingMode
  dataRole: DataRole
}

export const eventPresets: readonly EventPreset[] = [
  { id: 'preset.event.headache', name: 'Headache', description: 'A headache occurrence or episode.', categoryId: 'category.pain', icon: { type: 'emoji', value: '🤕' }, timingMode: 'either', dataRole: 'symptom' },
  { id: 'preset.event.migraine', name: 'Migraine', description: 'A migraine occurrence or episode.', categoryId: 'category.pain', icon: { type: 'emoji', value: '🌩️' }, timingMode: 'either', dataRole: 'symptom' },
  { id: 'preset.event.bowel-movement', name: 'Bowel Movement', description: 'A bowel movement.', categoryId: 'category.general-health', icon: { type: 'emoji', value: '🚽' }, timingMode: 'point', dataRole: 'measurement' },
  { id: 'preset.event.medication-taken', name: 'Medication Taken', description: 'A medication or as-needed treatment taken.', categoryId: 'category.medication-treatment', icon: { type: 'emoji', value: '💊' }, timingMode: 'point', dataRole: 'treatment' },
  { id: 'preset.event.iron-infusion', name: 'Iron Infusion', description: 'An iron infusion appointment or treatment.', categoryId: 'category.medication-treatment', icon: { type: 'emoji', value: '🩸' }, timingMode: 'duration', dataRole: 'treatment' },
  { id: 'preset.event.procedure', name: 'Procedures', description: 'A medical or personal-care procedure.', categoryId: 'category.medication-treatment', icon: { type: 'library', value: 'health' }, timingMode: 'either', dataRole: 'treatment' },
  { id: 'preset.event.exercise', name: 'Exercise', description: 'An exercise or movement session.', categoryId: 'category.lifestyle-activity', icon: { type: 'library', value: 'activity' }, timingMode: 'duration', dataRole: 'behavior' },
  { id: 'preset.event.period-started', name: 'Period Started', description: 'The day a period started.', categoryId: 'category.cycle-reproductive', icon: { type: 'emoji', value: '🩸' }, timingMode: 'dayOnly', dataRole: 'symptom' },
  { id: 'preset.event.travel', name: 'Travel', description: 'A trip or travel period.', categoryId: 'category.lifestyle-activity', icon: { type: 'emoji', value: '✈️' }, timingMode: 'either', dataRole: 'context' },
  { id: 'preset.event.sexual-activity', name: 'Sexual Activity', description: 'A sexual activity event.', categoryId: 'category.cycle-reproductive', icon: { type: 'emoji', value: '♥️' }, timingMode: 'point', dataRole: 'behavior' },
  { id: 'preset.event.food-reaction', name: 'Food Reaction', description: 'A reaction associated with food or another exposure.', categoryId: 'category.diet-hydration', icon: { type: 'emoji', value: '🍽️' }, timingMode: 'either', dataRole: 'symptom' },
  { id: 'preset.event.heating-pad', name: 'Heating Pad', description: 'A heating-pad treatment session.', categoryId: 'category.medication-treatment', icon: { type: 'emoji', value: '🔥' }, timingMode: 'duration', dataRole: 'treatment' },
]
