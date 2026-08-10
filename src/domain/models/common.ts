export type EntityId = string
export type ISODate = string
export type ISODateTime = string
export type IANATimeZone = string

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export interface Entity {
  id: EntityId
}

export interface SyncableEntity extends Entity {
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt: ISODateTime | null
  revision: number
  originDeviceId?: EntityId
}

export type IconReference =
  | { type: 'library'; value: string }
  | { type: 'emoji'; value: string }
  | { type: 'customAsset'; value: EntityId }
