import { First } from "../utils/type"
import { Activity } from "./activity"

type Attributes = {
  id: string
  type: "codap_activity"
  url: string | null
}

type Relationships = {
  activity: Activity
}

type CodapActivityRelationships<T extends string> = Omit<
  {
    [Key in T as First<Key>]: Key extends `activity.${infer Last}`
      ? Activity<Last>
      : Key extends keyof Relationships
      ? Relationships[Key]
      : never
  },
  ""
>

export type CodapActivity<T extends string = ""> = Attributes &
  CodapActivityRelationships<T>

export type Activitiable = CodapActivity
