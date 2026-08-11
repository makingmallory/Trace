import type { DataRole, IconReference, InputType, ValueDirection } from '../domain/models/index.ts'

export interface CategoryPreset {
  id: string
  name: string
  sortOrder: number
}

export interface TrackablePreset {
  id: string
  categoryId: string
  name: string
  description?: string
  inputType: InputType
  dataRole: DataRole
  valueDirection: ValueDirection
  icon: IconReference
  unit?: string
  scale?: { min: number; max: number; step: number }
  options?: readonly string[]
  tags?: readonly string[]
}

export interface PresetPack {
  id: string
  name: string
  description: string
  presetIds: readonly string[]
  futureItems?: readonly string[]
}

export const categoryPresets: readonly CategoryPreset[] = [
  ['mood-mental', 'Mood & Mental'],
  ['sleep-energy', 'Sleep & Energy'],
  ['skin', 'Skin'],
  ['cycle-reproductive', 'Cycle & Reproductive'],
  ['pain', 'Pain'],
  ['general-health', 'General Health'],
  ['diet-hydration', 'Diet & Hydration'],
  ['medication-treatment', 'Medication & Treatment'],
  ['lifestyle-activity', 'Lifestyle & Activity'],
  ['custom-other', 'Custom / Other'],
].map(([slug, name], sortOrder) => ({ id: `category.${slug}`, name, sortOrder }))

const icons: Record<string, IconReference> = {
  mood: { type: 'library', value: 'heart' }, sleep: { type: 'library', value: 'moon' }, skin: { type: 'library', value: 'sparkle' },
  cycle: { type: 'library', value: 'cycle' }, pain: { type: 'library', value: 'pulse' }, health: { type: 'library', value: 'health' },
  diet: { type: 'library', value: 'drop' }, treatment: { type: 'library', value: 'capsule' }, activity: { type: 'library', value: 'activity' },
}

type PresetOverrides = Partial<Omit<TrackablePreset, 'id' | 'categoryId' | 'name'>>

function preset(category: string, slug: string, name: string, overrides: PresetOverrides = {}): TrackablePreset {
  const inputType = overrides.inputType ?? 'scale'
  return {
    id: `preset.${category}.${slug}`,
    categoryId: `category.${category}`,
    name,
    inputType,
    dataRole: overrides.dataRole ?? 'symptom',
    valueDirection: overrides.valueDirection ?? 'worse',
    icon: overrides.icon ?? icons[category.split('-')[0]] ?? { type: 'library', value: 'sparkle' },
    ...(inputType === 'scale' ? { scale: { min: 1, max: 5, step: 1 } } : {}),
    ...overrides,
  }
}

const yesNo = { inputType: 'boolean' as const, valueDirection: 'worse' as const }
const choice = (options: readonly string[], extra: PresetOverrides = {}): PresetOverrides => ({ inputType: 'single_choice', options, ...extra })
const multi = (options: readonly string[], extra: PresetOverrides = {}): PresetOverrides => ({ inputType: 'multi_select', options, ...extra })
const number = (unit?: string, extra: PresetOverrides = {}): PresetOverrides => ({ inputType: 'number', unit, dataRole: 'measurement', valueDirection: 'neutral', ...extra })
const duration = (extra: PresetOverrides = {}): PresetOverrides => ({ inputType: 'duration', unit: 'minutes', dataRole: 'measurement', valueDirection: 'neutral', ...extra })

export const trackablePresets: readonly TrackablePreset[] = [
  preset('mood-mental', 'overall-mood', 'Overall Mood', { valueDirection: 'better', dataRole: 'outcome' }),
  preset('mood-mental', 'depression', 'Depression'), preset('mood-mental', 'anxiety', 'Anxiety'),
  preset('mood-mental', 'irritability', 'Irritability'), preset('mood-mental', 'stress', 'Stress'),
  preset('mood-mental', 'motivation', 'Motivation', { valueDirection: 'better', dataRole: 'outcome' }),
  preset('mood-mental', 'focus', 'Focus', { description: 'Ability to sustain attention and concentrate.', valueDirection: 'better', dataRole: 'outcome' }),
  preset('mood-mental', 'brain-fog', 'Brain Fog', { description: 'Subjective cognitive fuzziness, slow thinking, or memory and word-finding difficulty.' }),
  preset('mood-mental', 'emotional-sensitivity', 'Emotional Sensitivity'),

  preset('sleep-energy', 'energy-level', 'Energy Level', { valueDirection: 'better', dataRole: 'outcome' }),
  preset('sleep-energy', 'fatigue', 'Fatigue'), preset('sleep-energy', 'sleep-duration', 'Sleep Duration', duration()),
  preset('sleep-energy', 'sleep-quality', 'Sleep Quality', { valueDirection: 'better', dataRole: 'outcome' }),
  preset('sleep-energy', 'trouble-falling-asleep', 'Trouble Falling Asleep', yesNo),
  preset('sleep-energy', 'nighttime-awakenings', 'Nighttime Awakenings', number('times')),
  preset('sleep-energy', 'nap', 'Nap', duration({ dataRole: 'behavior' })),

  preset('skin', 'acne-present', 'Acne Present', yesNo), preset('skin', 'acne-severity', 'Acne Severity'),
  preset('skin', 'acne-location', 'Acne Location', multi(['Forehead', 'Cheeks', 'Chin', 'Jaw', 'Back', 'Chest', 'Other'])),
  preset('skin', 'new-breakouts', 'New Breakouts', number('breakouts')),
  preset('skin', 'oiliness', 'Oiliness'), preset('skin', 'dryness', 'Dryness'), preset('skin', 'itching', 'Itching'),
  preset('skin', 'rash-flare-severity', 'Rash / Flare Severity'),
  preset('skin', 'custom-skin-flare-template', 'Custom Skin Flare Template', { inputType: 'text', valueDirection: 'neutral' }),

  preset('cycle-reproductive', 'discharge-volume', 'Discharge Volume'),
  preset('cycle-reproductive', 'discharge-consistency', 'Discharge Consistency', choice(['Watery', 'Creamy', 'Sticky', 'Egg white', 'Thick', 'Other'], { valueDirection: 'neutral' })),
  preset('cycle-reproductive', 'discharge-color', 'Discharge Color', choice(['Clear', 'White', 'Cream', 'Yellow', 'Green', 'Gray', 'Brown', 'Pink', 'Red', 'Other'], { valueDirection: 'neutral' })),
  preset('cycle-reproductive', 'bleeding-flow', 'Bleeding / Flow', choice(['Spotting', 'Light', 'Medium', 'Heavy'], { valueDirection: 'neutral' })),
  preset('cycle-reproductive', 'cramps', 'Cramps'), preset('cycle-reproductive', 'libido', 'Libido', { valueDirection: 'neutral' }),
  preset('cycle-reproductive', 'breast-tenderness', 'Breast Tenderness'), preset('cycle-reproductive', 'pelvic-pain', 'Pelvic Pain'),
  preset('cycle-reproductive', 'period-started', 'Period Started', { ...yesNo, valueDirection: 'neutral' }),
  preset('cycle-reproductive', 'period-ended', 'Period Ended', { ...yesNo, valueDirection: 'neutral' }),
  preset('cycle-reproductive', 'sexual-activity', 'Sexual Activity', { ...yesNo, dataRole: 'behavior', valueDirection: 'neutral' }),

  preset('pain', 'overall-pain', 'Overall Pain'), preset('pain', 'headache', 'Headache'), preset('pain', 'migraine', 'Migraine'),
  preset('pain', 'joint-pain', 'Joint Pain'), preset('pain', 'muscle-pain', 'Muscle Pain'), preset('pain', 'back-pain', 'Back Pain'),
  preset('pain', 'pain-location', 'Pain Location', { inputType: 'text', valueDirection: 'neutral' }),

  preset('general-health', 'overall-symptom-severity', 'Overall Symptom Severity'),
  preset('general-health', 'condition-autoimmune-flare', 'Condition / Autoimmune Flare'), preset('general-health', 'abdominal-pain', 'Abdominal Pain'),
  preset('general-health', 'bloating', 'Bloating'), preset('general-health', 'nausea', 'Nausea'),
  preset('general-health', 'bowel-movement', 'Bowel Movement', { ...yesNo, valueDirection: 'neutral' }),
  preset('general-health', 'bowel-movement-count', 'Bowel Movement Count', number('times')),
  preset('general-health', 'urgency', 'Urgency'),
  preset('general-health', 'stool-type', 'Stool Type', choice(['Type 1', 'Type 2', 'Type 3', 'Type 4', 'Type 5', 'Type 6', 'Type 7'], { valueDirection: 'neutral' })),
  preset('general-health', 'reflux-heartburn', 'Reflux / Heartburn'), preset('general-health', 'dizziness', 'Dizziness'),
  preset('general-health', 'temperature-fever', 'Temperature / Fever', number('°F')),
  preset('general-health', 'swelling', 'Swelling'), preset('general-health', 'congestion', 'Congestion'),
  preset('general-health', 'general-illness', 'General Illness'), preset('general-health', 'weight', 'Weight', number('lb')),

  preset('diet-hydration', 'appetite', 'Appetite', { valueDirection: 'neutral' }),
  preset('diet-hydration', 'water-intake', 'Water Intake', number('oz', { dataRole: 'behavior', valueDirection: 'better' })),
  preset('diet-hydration', 'caffeine', 'Caffeine', number('mg', { dataRole: 'exposure' })),
  preset('diet-hydration', 'alcohol', 'Alcohol', number('drinks', { dataRole: 'exposure' })),
  preset('diet-hydration', 'calories', 'Calories', number('kcal', { dataRole: 'behavior' })),
  preset('diet-hydration', 'protein', 'Protein', number('g', { dataRole: 'behavior' })),
  preset('diet-hydration', 'carbohydrates', 'Carbohydrates', number('g', { dataRole: 'behavior' })),
  preset('diet-hydration', 'fat', 'Fat', number('g', { dataRole: 'behavior' })),
  preset('diet-hydration', 'meal-skipped', 'Meal Skipped', { ...yesNo, dataRole: 'behavior' }),
  preset('diet-hydration', 'specific-food-exposure', 'Specific Food / Exposure', { inputType: 'text', dataRole: 'exposure', valueDirection: 'neutral' }),
  preset('diet-hydration', 'diet-quality', 'Diet Quality', { dataRole: 'behavior', valueDirection: 'better' }),
  preset('diet-hydration', 'food-reaction', 'Food Reaction'),

  preset('medication-treatment', 'medication-taken', 'Medication Taken', { ...yesNo, dataRole: 'treatment', valueDirection: 'neutral' }),
  preset('medication-treatment', 'prn-medication', 'PRN Medication', { inputType: 'text', dataRole: 'treatment', valueDirection: 'neutral' }),
  preset('medication-treatment', 'supplement', 'Supplement', { inputType: 'text', dataRole: 'treatment', valueDirection: 'neutral' }),
  preset('medication-treatment', 'injection', 'Injection', { ...yesNo, dataRole: 'treatment', valueDirection: 'neutral' }),
  preset('medication-treatment', 'infusion', 'Infusion', { ...yesNo, dataRole: 'treatment', valueDirection: 'neutral' }),
  preset('medication-treatment', 'treatment-therapy', 'Treatment / Therapy', { inputType: 'text', dataRole: 'treatment', valueDirection: 'neutral' }),
  preset('medication-treatment', 'dose', 'Dose', number(undefined, { dataRole: 'treatment' })),
  preset('medication-treatment', 'medication-side-effects', 'Medication Side Effects'),
  preset('medication-treatment', 'treatment-effectiveness', 'Treatment Effectiveness', { dataRole: 'outcome', valueDirection: 'better' }),

  preset('lifestyle-activity', 'exercise', 'Exercise', duration({ dataRole: 'behavior', valueDirection: 'better' })),
  preset('lifestyle-activity', 'activity-level', 'Activity Level', { dataRole: 'behavior', valueDirection: 'better' }),
  preset('lifestyle-activity', 'steps', 'Steps', number('steps', { dataRole: 'behavior', valueDirection: 'better' })),
  preset('lifestyle-activity', 'time-outdoors', 'Time Outdoors', duration({ dataRole: 'behavior', valueDirection: 'better' })),
  preset('lifestyle-activity', 'social-activity', 'Social Activity', duration({ dataRole: 'behavior', valueDirection: 'neutral' })),
  preset('lifestyle-activity', 'work-school-stress', 'Work / School Stress', { dataRole: 'context' }),
  preset('lifestyle-activity', 'screen-time', 'Screen Time', duration({ dataRole: 'behavior' })),
  preset('lifestyle-activity', 'travel', 'Travel', { ...yesNo, dataRole: 'context', valueDirection: 'neutral' }),
  preset('lifestyle-activity', 'major-stressor', 'Major Stressor', { inputType: 'text', dataRole: 'context' }),
  preset('lifestyle-activity', 'sick-rest-day', 'Sick Day / Rest Day', { ...yesNo, dataRole: 'context', valueDirection: 'neutral' }),
]

const ids = (...slugs: string[]) => slugs.map((slug) => `preset.${slug}`)

export const presetPacks: readonly PresetPack[] = [
  { id: 'pack.cycle-tracking', name: 'Cycle Tracking', description: 'Cycle signs, symptoms, skin, and mood.', presetIds: ids('cycle-reproductive.discharge-volume', 'cycle-reproductive.discharge-consistency', 'cycle-reproductive.discharge-color', 'cycle-reproductive.bleeding-flow', 'cycle-reproductive.cramps', 'cycle-reproductive.libido', 'skin.acne-severity', 'mood-mental.overall-mood') },
  { id: 'pack.skin-tracking', name: 'Skin Tracking', description: 'Breakouts, locations, oiliness, dryness, and flares.', presetIds: ids('skin.acne-severity', 'skin.acne-location', 'skin.new-breakouts', 'skin.oiliness', 'skin.dryness', 'skin.rash-flare-severity') },
  { id: 'pack.chronic-illness', name: 'Chronic Illness', description: 'A practical baseline for energy, symptoms, sleep, and treatment.', presetIds: ids('sleep-energy.fatigue', 'sleep-energy.energy-level', 'sleep-energy.sleep-quality', 'pain.overall-pain', 'general-health.condition-autoimmune-flare', 'general-health.abdominal-pain', 'medication-treatment.medication-taken') },
  { id: 'pack.mood-energy', name: 'Mood & Energy', description: 'Mood, mental health, energy, fatigue, and sleep.', presetIds: ids('mood-mental.overall-mood', 'mood-mental.depression', 'mood-mental.anxiety', 'mood-mental.irritability', 'mood-mental.stress', 'sleep-energy.energy-level', 'sleep-energy.fatigue', 'sleep-energy.sleep-quality') },
  { id: 'pack.treatment-effectiveness', name: 'Treatment Effectiveness', description: 'A starting point for symptom and treatment outcomes.', presetIds: ids('general-health.overall-symptom-severity', 'medication-treatment.medication-taken', 'medication-treatment.treatment-effectiveness'), futureItems: ['Treatment events', 'Symptom duration'] },
]

export function getPresetById(id: string): TrackablePreset | undefined {
  return trackablePresets.find((item) => item.id === id)
}
