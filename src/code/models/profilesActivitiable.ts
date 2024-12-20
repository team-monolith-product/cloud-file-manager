import { First } from "../utils/type"
import { ProfilesActivity } from "./profilesActivity"

type Attributes = {
  id: string
  type: "profiles_codap_activity"
  url: string | null
  projectDataUpdatedAt: string | null // 한번도 저장하지 않은 경우 null
  lastStep: number
}

type Relationships = {
  profilesActivity: ProfilesActivity
}

type ProfilesCodapActivityRelationships<T extends string> = Omit<
  {
    [Key in T as First<Key>]: Key extends `profilesActivity.${infer Last}`
      ? ProfilesActivity<Last>
      : Key extends keyof Relationships
      ? Relationships[Key]
      : never
  },
  ""
>

export type ProfilesCodapActivity<T extends string = ""> = Attributes &
  ProfilesCodapActivityRelationships<T>

export type ProfilesActivitiable = ProfilesCodapActivity
